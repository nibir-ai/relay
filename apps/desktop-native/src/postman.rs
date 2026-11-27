use reqwest::Url;
use serde_json::Value;

use crate::transport::METHODS;

pub struct Import {
    pub requests: Vec<(String, String)>,
    pub skipped: usize,
}

pub fn read(raw: &str, available: usize) -> Result<Import, String> {
    if available == 0 {
        return Err("Close a request tab before importing.".into());
    }
    if raw.len() > 512 * 1024 {
        return Err("Paste a collection under 512 KiB.".into());
    }
    let collection: Value =
        serde_json::from_str(raw).map_err(|_| "Paste a valid Postman collection JSON export.")?;
    let schema = collection["info"]["schema"].as_str().unwrap_or_default();
    if !matches!(
        schema,
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            | "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
    ) {
        return Err("Choose a Postman Collection v2.0 or v2.1 export.".into());
    }
    let items = collection["item"]
        .as_array()
        .ok_or("The collection has no request list.")?;
    let mut result = Import {
        requests: Vec::new(),
        skipped: 0,
    };
    let mut pending: Vec<_> = items.iter().rev().collect();
    while let Some(item) = pending.pop() {
        if let Some(children) = item["item"].as_array() {
            pending.extend(children.iter().rev());
            continue;
        }
        let request = &item["request"];
        let method = request["method"].as_str().unwrap_or_default();
        let target = request["url"]
            .as_str()
            .or_else(|| request["url"]["raw"].as_str())
            .unwrap_or_default();
        let accepted = result.requests.len() < available
            && METHODS.contains(&method)
            && target.len() <= 8192
            && !target.contains("{{")
            && !target.contains("}}");
        if accepted
            && let Ok(mut url) = Url::parse(target)
            && matches!(url.scheme(), "http" | "https")
            && url.host().is_some()
            && url.username().is_empty()
            && url.password().is_none()
        {
            // Open a clean draft. Query parameters, fragments and credential-bearing fields
            // require manual review and re-entry.
            url.set_query(None);
            url.set_fragment(None);
            result.requests.push((method.into(), url.into()));
        } else {
            result.skipped += 1;
        }
    }
    if result.requests.is_empty() {
        return Err("No supported HTTP requests with literal URLs were found.".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_nested_requests_without_importing_auth_or_query() {
        let input = r#"{
            "info": {"schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
            "item": [{"item":[
                {"request":{"method":"GET","url":{"raw":"https://example.test/items?token=private#anchor"},"auth":{"type":"bearer"}}},
                {"request":{"method":"POST","url":"{{baseUrl}}/items"}},
                {"request":{"method":"GET","url":"https://user:pass@example.test/"}},
                {"request":{"method":"POST","url":"https://example.test/other"}}
            ]}]
        }"#;
        let report = read(input, 1).unwrap();
        assert_eq!(
            report.requests,
            vec![("GET".into(), "https://example.test/items".into())]
        );
        assert_eq!(report.skipped, 3);
    }
}
