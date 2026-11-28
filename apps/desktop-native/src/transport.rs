use reqwest::{Client, Method, Url, header};
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

const BODY_LIMIT: usize = 2 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);
pub const METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

pub enum Auth {
    None,
    Bearer(String),
    Basic(String, String),
    ApiKey(String, String),
}

pub struct Request {
    pub method: String,
    pub url: String,
    pub query: Vec<(String, String)>,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub auth: Auth,
}

pub struct Response {
    pub status: u16,
    pub reason: &'static str,
    pub elapsed_ms: u128,
    pub bytes: usize,
    pub truncated: bool,
    pub headers: String,
    pub content_type: String,
    pub body: String,
    pub pretty_body: Option<crate::response_body::JsonPreview>,
}

fn request_headers(rows: &[(String, String)]) -> Result<header::HeaderMap, String> {
    if rows.len() > 100 || pair_bytes(rows) > 32768 {
        return Err("Use at most 100 headers and 32 KiB of header text.".into());
    }
    let mut result = header::HeaderMap::new();
    for (name, value) in rows {
        insert_header(&mut result, name, value)?;
    }
    Ok(result)
}

fn insert_header(headers: &mut header::HeaderMap, name: &str, value: &str) -> Result<(), String> {
    let name = header::HeaderName::from_bytes(name.trim().as_bytes())
        .map_err(|_| "Invalid header name.")?;
    let key = name.as_str();
    if matches!(
        key,
        "host" | "content-length" | "transfer-encoding" | "connection" | "upgrade" | "expect"
    ) || key.starts_with("proxy-")
        || key.starts_with("sec-")
    {
        return Err("A header name is reserved by the transport.".into());
    }
    let value = header::HeaderValue::from_str(value.trim()).map_err(|_| "Invalid header value.")?;
    if headers.contains_key(&name) {
        return Err("Remove duplicate headers or choose one authentication source.".into());
    }
    headers.insert(name, value);
    Ok(())
}

fn pair_bytes(rows: &[(String, String)]) -> usize {
    rows.iter()
        .map(|(key, value)| key.len() + value.len())
        .sum()
}

fn request_url(raw: &str, query: &[(String, String)]) -> Result<Url, String> {
    let mut url = Url::parse(raw.trim()).map_err(|_| "Enter a complete HTTP or HTTPS URL.")?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err("Only HTTP and HTTPS URLs are supported.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Put credentials in the Auth panel.".into());
    }
    for (key, value) in query {
        if key.trim().is_empty() {
            return Err("Each query parameter needs a name.".into());
        }
        url.query_pairs_mut().append_pair(key.trim(), value);
    }
    url.set_fragment(None);
    if url.as_str().len() > 8192 {
        return Err("The final URL exceeds 8 KiB.".into());
    }
    Ok(url)
}

pub fn execute(request: Request, mut cancel: oneshot::Receiver<()>) -> Result<Response, String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "Could not start the HTTP worker.")?;
    runtime.block_on(async {
        tokio::select! {
            biased;
            _ = &mut cancel => Err("Request cancelled.".into()),
            result = tokio::time::timeout(TIMEOUT, send(request)) => {
                result.unwrap_or_else(|_| Err("Request timed out after 30 seconds.".into()))
            }
        }
    })
}

async fn send(request: Request) -> Result<Response, String> {
    if !METHODS.contains(&request.method.as_str()) {
        return Err("Choose a supported HTTP method.".into());
    }
    if request.body.len() > BODY_LIMIT
        || request.url.len().saturating_add(pair_bytes(&request.query)) > 8192
    {
        return Err("Use a URL under 8 KiB and a body under 2 MiB.".into());
    }
    let url = request_url(&request.url, &request.query)?;
    let mut headers = request_headers(&request.headers)?;
    let method =
        Method::from_bytes(request.method.as_bytes()).map_err(|_| "Invalid HTTP method.")?;
    if matches!(method, Method::GET | Method::HEAD) && !request.body.is_empty() {
        return Err("GET and HEAD requests cannot send a body.".into());
    }
    if !matches!(request.auth, Auth::None) && headers.contains_key(header::AUTHORIZATION) {
        return Err("Choose Auth settings or an Authorization header.".into());
    }
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize HTTPS.")?;
    let mut outgoing = client.request(method, url);
    match request.auth {
        Auth::None => {}
        Auth::Bearer(token) => insert_header(
            &mut headers,
            "Authorization",
            &format!("Bearer {}", token.trim()),
        )?,
        Auth::Basic(user, password) => {
            if user.contains(':') || user.len().saturating_add(password.len()) > 8192 {
                return Err(
                    "Use a Basic username without a colon and credentials under 8 KiB.".into(),
                );
            }
            outgoing = outgoing.basic_auth(user, Some(password));
        }
        Auth::ApiKey(name, value) => insert_header(&mut headers, &name, &value)?,
    }
    if headers
        .iter()
        .map(|(name, value)| name.as_str().len() + value.as_bytes().len())
        .sum::<usize>()
        > 32768
    {
        return Err("Headers and credentials exceed 32 KiB.".into());
    }
    let started = Instant::now();
    outgoing = outgoing.headers(headers);
    if !request.body.is_empty() {
        outgoing = outgoing.body(request.body);
    }
    let mut incoming = outgoing.send().await.map_err(|error| {
        if error.is_connect() {
            "Could not connect. Check the address, server and TLS certificate."
        } else {
            "The HTTP request failed."
        }
    })?;
    let status = incoming.status();
    let content_type = incoming
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or_default()
        .trim()
        .to_owned();
    let headers = incoming
        .headers()
        .iter()
        .map(|(name, value)| format!("{name}: {}", String::from_utf8_lossy(value.as_bytes())))
        .collect::<Vec<_>>()
        .join("\n");
    let mut bytes = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = incoming
        .chunk()
        .await
        .map_err(|_| "The response ended before it could be read.")?
    {
        let available = BODY_LIMIT - bytes.len();
        bytes.extend_from_slice(&chunk[..available.min(chunk.len())]);
        if chunk.len() > available {
            truncated = true;
            break;
        }
    }
    let body = String::from_utf8_lossy(&bytes).into_owned();
    let media_type = content_type.to_ascii_lowercase();
    let pretty_body =
        if !truncated && (media_type == "application/json" || media_type.ends_with("+json")) {
            crate::response_body::pretty_json(&body)
        } else {
            None
        };
    Ok(Response {
        status: status.as_u16(),
        reason: status.canonical_reason().unwrap_or(""),
        elapsed_ms: started.elapsed().as_millis(),
        bytes: bytes.len(),
        truncated,
        headers,
        content_type,
        body,
        pretty_body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn serve(reply: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/fixture", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut captured = Vec::new();
            let mut buffer = [0; 512];
            while !captured.windows(4).any(|part| part == b"\r\n\r\n") {
                let count = stream.read(&mut buffer).unwrap();
                assert_ne!(count, 0);
                captured.extend_from_slice(&buffer[..count]);
            }
            stream.write_all(reply.as_bytes()).unwrap();
            String::from_utf8(captured).unwrap()
        });
        (url, server)
    }

    fn request(url: String, auth: Auth) -> Request {
        Request {
            method: "GET".into(),
            url,
            query: vec![("tag".into(), "one".into()), ("tag".into(), "two".into())],
            headers: vec![("Accept".into(), "application/json".into())],
            body: String::new(),
            auth,
        }
    }

    #[test]
    fn sends_repeated_query_values_and_each_selected_credential() {
        const BODY: &str = r#"{"id":9007199254740993,"k":1,"k":2}"#;
        const REPLY: &str = concat!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
            r#"{"id":9007199254740993,"k":1,"k":2}"#
        );
        for (auth, expected) in [
            (
                Auth::Bearer("fixture-user".into()),
                "authorization: Bearer fixture-user",
            ),
            (
                Auth::Basic("fixture".into(), "admin".into()),
                "authorization: Basic Zml4dHVyZTphZG1pbg==",
            ),
            (
                Auth::ApiKey("X-Test-Key".into(), "fixture-key".into()),
                "x-test-key: fixture-key",
            ),
        ] {
            let (url, server) = serve(REPLY);
            let (_sender, receiver) = oneshot::channel();
            let response = execute(request(url, auth), receiver).unwrap();
            assert_eq!((response.status, response.body.as_str()), (200, BODY));
            let observed = server.join().unwrap();
            assert!(observed.starts_with("GET /fixture?tag=one&tag=two HTTP/1.1\r\n"));
            assert!(observed.lines().any(|line| line == expected));
        }
    }

    #[test]
    fn returns_redirect_response_as_received() {
        let (url, server) = serve(
            "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/elsewhere\r\nContent-Length: 0\r\n\r\n",
        );
        let (_sender, receiver) = oneshot::channel();
        let response = execute(request(url, Auth::Bearer("fixture".into())), receiver).unwrap();
        assert_eq!(response.status, 302);
        server.join().unwrap();
    }

    #[test]
    fn cancels_a_request_that_has_reached_the_server() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (sender, receiver) = oneshot::channel();
        let client = thread::spawn(move || execute(request(url, Auth::None), receiver));
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        assert!(stream.read(&mut [0; 512]).unwrap() > 0);
        sender.send(()).unwrap();
        assert_eq!(
            client.join().unwrap().err().as_deref(),
            Some("Request cancelled.")
        );
    }
}
