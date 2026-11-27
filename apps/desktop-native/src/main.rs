#![forbid(unsafe_code)]
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod postman;
mod transport;
mod workspace;

use rune::{AppSpec, Key, KeyEvent, Latest, TextEdit, Tx};
use tokio::sync::oneshot;
use transport::{Auth, Request, Response};

const THEMES: &[&str] = &["Everblush", "One Dark", "Gruvbox", "Nord", "Paper"];
const AUTH: &[&str] = &["None", "Bearer", "Basic", "API key"];
const EDITORS: &[&str] = &["Parameters", "Headers", "Body", "Auth"];

struct Draft {
    id: u64,
    method: String,
    url: TextEdit,
    query: TextEdit,
    headers: TextEdit,
    body: TextEdit,
    auth: String,
    identity: TextEdit,
    secret: TextEdit,
    response: Option<Response>,
    outcome: String,
}

impl Draft {
    fn new(id: u64) -> Self {
        Self {
            id,
            method: "GET".into(),
            url: TextEdit::new(""),
            query: TextEdit::new(""),
            headers: TextEdit::new("Accept: application/json"),
            body: TextEdit::new(""),
            auth: "None".into(),
            identity: TextEdit::new(""),
            secret: TextEdit::new("").secure(),
            response: None,
            outcome: String::new(),
        }
    }

    fn request(&self) -> Result<Request, String> {
        let identity = self.identity.text.trim();
        let secret = self.secret.text.as_str();
        let auth = match self.auth.as_str() {
            "None" => Auth::None,
            "Bearer" if !secret.trim().is_empty() => Auth::Bearer(secret.into()),
            "Basic" if !identity.is_empty() => Auth::Basic(identity.into(), secret.into()),
            "API key" if !identity.is_empty() && !secret.is_empty() => {
                Auth::ApiKey(identity.into(), secret.into())
            }
            _ => return Err("Fill in the authentication fields before sending.".into()),
        };
        Ok(Request {
            method: self.method.clone(),
            url: self.url.text.to_string(),
            query: self.query.text.to_string(),
            headers: self.headers.text.to_string(),
            body: if matches!(self.method.as_str(), "GET" | "HEAD") {
                String::new()
            } else {
                self.body.text.to_string()
            },
            auth,
        })
    }
}

struct State {
    drafts: Vec<Draft>,
    selected: usize,
    next_id: u64,
    theme: String,
    menu: Option<&'static str>,
    editor: &'static str,
    show_headers: bool,
    job: Latest<(u64, Result<Response, String>)>,
    active: Option<(u64, Option<oneshot::Sender<()>>)>,
    history: Vec<String>,
    notice: String,
    import_open: bool,
    import_text: TextEdit,
    import_status: String,
}

impl Default for State {
    fn default() -> Self {
        Self {
            drafts: vec![Draft::new(1)],
            selected: 0,
            next_id: 2,
            theme: THEMES[0].into(),
            menu: None,
            editor: EDITORS[0],
            show_headers: false,
            job: Latest::default(),
            active: None,
            history: Vec::new(),
            notice: String::new(),
            import_open: false,
            import_text: TextEdit::new("").secure(),
            import_status: String::new(),
        }
    }
}

impl State {
    fn draft(&self) -> &Draft {
        &self.drafts[self.selected]
    }
    fn draft_mut(&mut self) -> &mut Draft {
        &mut self.drafts[self.selected]
    }

    fn new_draft(&mut self, tx: &mut Tx) {
        if self.drafts.len() >= 12 {
            return;
        }
        self.drafts.push(Draft::new(self.next_id));
        self.next_id += 1;
        self.select(self.drafts.len() - 1);
        tx.focus("url", true);
    }

    fn select(&mut self, index: usize) {
        if self.import_open {
            self.cancel_import();
        }
        self.selected = index;
        self.editor = EDITORS[0];
        self.show_headers = false;
        self.notice.clear();
    }

    fn close_draft(&mut self) {
        if self.drafts.len() == 1
            || self
                .active
                .as_ref()
                .is_some_and(|(id, _)| *id == self.draft().id)
        {
            return;
        }
        self.drafts.remove(self.selected);
        self.select(self.selected.min(self.drafts.len() - 1));
    }

    fn send(&mut self) {
        if self.active.is_some() || self.import_open {
            return;
        }
        self.notice.clear();
        self.show_headers = false;
        let draft = self.draft_mut();
        draft.response = None;
        draft.outcome.clear();
        let request = match draft.request() {
            Ok(request) => request,
            Err(error) => {
                draft.outcome = error;
                return;
            }
        };
        let id = draft.id;
        let (send, receive) = oneshot::channel();
        self.active = Some((id, Some(send)));
        self.job
            .request((request, receive), move |(request, receive)| {
                (id, transport::execute(request, receive))
            });
    }

    fn cancel(&mut self) {
        if let Some((_, sender)) = &mut self.active {
            if let Some(sender) = sender.take() {
                let _ = sender.send(());
            }
        }
    }

    fn poll(&mut self) -> bool {
        let Some((id, result)) = self.job.take() else {
            return false;
        };
        self.active = None;
        if let Some(draft) = self.drafts.iter_mut().find(|draft| draft.id == id) {
            match result {
                Ok(response) => {
                    self.history.insert(
                        0,
                        format!(
                            "{}   {}   {} ms",
                            draft.method, response.status, response.elapsed_ms
                        ),
                    );
                    self.history.truncate(12);
                    draft.outcome.clear();
                    draft.response = Some(response);
                }
                Err(error) => draft.outcome = error,
            }
        }
        true
    }

    fn copy_response(&mut self) {
        let Some(response) = &self.draft().response else {
            return;
        };
        let content = if self.show_headers {
            &response.headers
        } else {
            &response.body
        };
        self.notice = if arboard::Clipboard::new()
            .and_then(|mut board| board.set_text(content.clone()))
            .is_ok()
        {
            "Copied".into()
        } else {
            "Clipboard unavailable".into()
        };
    }

    fn open_import(&mut self, tx: &mut Tx) {
        self.import_open = true;
        self.import_status.clear();
        tx.focus("Postman collection", true);
    }

    fn cancel_import(&mut self) {
        self.import_open = false;
        self.import_text = TextEdit::new("").secure();
    }

    fn import(&mut self) {
        let report = match postman::read(&self.import_text.text, 12 - self.drafts.len()) {
            Ok(report) => report,
            Err(error) => {
                self.import_status = error;
                return;
            }
        };
        let first = self.drafts.len();
        let imported = report.requests.len();
        for (method, url) in report.requests {
            let mut draft = Draft::new(self.next_id);
            draft.method = method;
            draft.url = TextEdit::new(url);
            self.next_id += 1;
            self.drafts.push(draft);
        }
        self.cancel_import();
        self.select(first);
        self.notice = format!(
            "Imported {imported} request(s). Skipped {}.",
            report.skipped
        );
    }
}

fn shortcut(state: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if tx.key_repeat() || state.menu.is_some() || state.import_open {
        return false;
    }
    if event.is_command('n') {
        state.new_draft(tx);
        return true;
    }
    if event.mods.primary() && event.key == Key::Enter {
        state.send();
        return true;
    }
    false
}

fn main() {
    rune::run(AppSpec {
        min_size: Some((640.0, 490.0)),
        setup: Some(|state: &mut State, waker| state.job.set_waker(waker)),
        poll: Some(|state: &mut State, _, _| state.poll()),
        on_key: Some(shortcut),
        ..AppSpec::new(
            "Relay Desktop",
            (1260.0, 820.0),
            State::default,
            workspace::view,
        )
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};

    #[test]
    fn request_tabs_and_import_render_at_minimum_window_size() {
        let env = Env {
            system_dark: true,
            scale: 2.0,
        };
        let mut runtime = Runtime::new(State::default(), workspace::view, (640.0, 490.0), env);
        runtime.frame(0.0);
        for key in ["url", "send", "response", "import", "edit-Auth"] {
            assert!(runtime.find(key).is_some(), "missing {key}");
        }
        for (key, expected_count) in [("new", 2), ("import", 2)] {
            let (x, y) = runtime.find(key).unwrap();
            runtime.pointer_down(x, y);
            runtime.pointer_up(x, y);
            runtime.frame(0.0);
            assert_eq!(runtime.state.drafts.len(), expected_count);
        }
        assert!(runtime.state.import_open);
        assert!(runtime.find("import-submit").is_some());
        assert!(runtime.find("send").is_none());
    }

    #[test]
    fn ctrl_enter_reaches_send_from_the_focused_url_editor() {
        let mut state = State::default();
        state.draft_mut().auth = "Bearer".into();
        let mut runtime = Runtime::new(state, workspace::view, (900.0, 640.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        let (x, y) = runtime.find("url").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(0.0);
        runtime.key(KeyEvent {
            key: Key::Enter,
            mods: rune::Mods {
                cmd: true,
                ctrl: true,
                ..Default::default()
            },
        });
        runtime.frame(0.0);
        assert_eq!(
            runtime.state.draft().outcome,
            "Fill in the authentication fields before sending."
        );
    }
}
