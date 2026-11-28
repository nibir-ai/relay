#![forbid(unsafe_code)]
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod postman;
mod response_body;
mod transport;
mod workspace;

use rune::{AppSpec, Key, KeyEvent, Latest, TextEdit, Tx};
use tokio::sync::oneshot;
use transport::{Auth, Request, Response};

const THEMES: &[&str] = &["Everblush", "One Dark", "Gruvbox", "Nord", "Paper"];
const AUTH: &[&str] = &["None", "Bearer", "Basic", "API key"];
const EDITORS: &[&str] = &["Parameters", "Headers", "Body", "Auth"];

#[derive(Clone, Copy, PartialEq, Eq)]
enum ResponseView {
    Body,
    Raw,
    Headers,
}

impl ResponseView {
    fn label(self) -> &'static str {
        match self {
            Self::Body => "Body",
            Self::Raw => "Raw",
            Self::Headers => "Headers",
        }
    }
}

struct Pair {
    name: TextEdit,
    value: TextEdit,
}

impl Pair {
    fn new(name: &str, value: &str) -> Self {
        Self {
            name: TextEdit::new(name),
            value: TextEdit::new(value),
        }
    }
}

struct RecentResult {
    method: String,
    status: u16,
    elapsed_ms: u128,
}

struct Draft {
    id: u64,
    name: TextEdit,
    method: String,
    url: TextEdit,
    query: Vec<Pair>,
    headers: Vec<Pair>,
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
            name: TextEdit::new(""),
            method: "GET".into(),
            url: TextEdit::new(""),
            query: vec![Pair::new("", "")],
            headers: vec![Pair::new("Accept", "application/json")],
            body: TextEdit::new(""),
            auth: "None".into(),
            identity: TextEdit::new(""),
            secret: TextEdit::new("").secure(),
            response: None,
            outcome: String::new(),
        }
    }

    fn title(&self) -> String {
        let title = self.name.text.trim();
        if title.is_empty() {
            format!("Request {}", self.id)
        } else {
            title.to_owned()
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
            query: request_pairs(&self.query),
            headers: request_pairs(&self.headers),
            body: if matches!(self.method.as_str(), "GET" | "HEAD") {
                String::new()
            } else {
                self.body.text.to_string()
            },
            auth,
        })
    }
}

fn request_pairs(rows: &[Pair]) -> Vec<(String, String)> {
    rows.iter()
        .filter(|row| !row.name.text.trim().is_empty() || !row.value.text.is_empty())
        .map(|row| (row.name.text.clone(), row.value.text.clone()))
        .collect()
}

struct State {
    drafts: Vec<Draft>,
    selected: usize,
    next_id: u64,
    theme: String,
    menu: Option<&'static str>,
    editor: &'static str,
    response_view: ResponseView,
    job: Latest<(u64, String, Result<Response, String>)>,
    active: Option<(u64, Option<oneshot::Sender<()>>)>,
    history: Vec<RecentResult>,
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
            response_view: ResponseView::Body,
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

    fn active_draft_index(&self) -> Option<usize> {
        let (id, _) = self.active.as_ref()?;
        self.drafts.iter().position(|draft| draft.id == *id)
    }

    fn show_active_draft(&mut self) {
        if let Some(index) = self.active_draft_index() {
            self.select(index);
        }
    }

    fn new_draft(&mut self, tx: &mut Tx) {
        if self.drafts.len() >= 12 {
            return;
        }
        self.drafts.push(Draft::new(self.next_id));
        self.next_id += 1;
        self.select(self.drafts.len() - 1);
        tx.focus_when_shown("url", true);
    }

    fn select(&mut self, index: usize) {
        if self.import_open {
            self.cancel_import();
        }
        self.selected = index;
        self.editor = EDITORS[0];
        self.response_view = ResponseView::Body;
        self.notice.clear();
    }

    fn close_draft(&mut self, tx: &mut Tx) {
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
        tx.focus_when_shown(format!("request-{}", self.draft().id), true);
    }

    fn send(&mut self) {
        if self.active.is_some() || self.import_open {
            return;
        }
        self.notice.clear();
        self.response_view = ResponseView::Body;
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
        let method = request.method.clone();
        let (send, receive) = oneshot::channel();
        self.active = Some((id, Some(send)));
        self.job
            .request((request, receive), move |(request, receive)| {
                (id, method, transport::execute(request, receive))
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
        let Some((id, method, result)) = self.job.take() else {
            return false;
        };
        self.active = None;
        if let Some(draft) = self.drafts.iter_mut().find(|draft| draft.id == id) {
            match result {
                Ok(response) => {
                    self.history.insert(
                        0,
                        RecentResult {
                            method,
                            status: response.status,
                            elapsed_ms: response.elapsed_ms,
                        },
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
        let content = if self.response_view == ResponseView::Headers {
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
        tx.focus_when_shown("Postman collection", true);
    }

    fn cancel_import(&mut self) {
        self.import_open = false;
        self.import_text = TextEdit::new("").secure();
    }

    fn dismiss_import(&mut self, tx: &mut Tx) {
        self.cancel_import();
        tx.focus("import", true);
    }

    fn import(&mut self, tx: &mut Tx) {
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
        tx.focus_when_shown("url", true);
        self.notice = format!(
            "Imported {imported} request(s). Skipped {}.",
            report.skipped
        );
    }
}

fn shortcut(state: &mut State, event: &KeyEvent, tx: &mut Tx) -> bool {
    if tx.key_repeat() || state.menu.is_some() {
        return false;
    }
    if state.import_open {
        if event.key == Key::Escape {
            state.dismiss_import(tx);
            return true;
        }
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

    fn click(runtime: &mut Runtime<State>, key: &str) {
        let (x, y) = runtime.find(key).expect("control is visible");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(0.0);
    }

    fn press(runtime: &mut Runtime<State>, key: Key) {
        runtime.key(KeyEvent {
            key,
            mods: Default::default(),
        });
        runtime.frame(0.0);
    }

    fn assert_focus(runtime: &Runtime<State>, key: &str) {
        let focused = runtime.elements().into_iter().find(|node| node.focused);
        assert_eq!(focused.and_then(|node| node.key).as_deref(), Some(key));
    }

    #[test]
    fn request_tabs_and_import_render_at_minimum_window_size() {
        let env = Env {
            system_dark: true,
            scale: 2.0,
        };
        let mut runtime = Runtime::new(State::default(), workspace::view, (640.0, 490.0), env);
        runtime.frame(0.0);
        for key in ["url", "request-action", "response", "import", "edit-Auth"] {
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
        assert!(runtime.find("request-action").is_none());
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

    #[test]
    fn requests_use_a_single_tab_stop_and_arrow_keys_open_the_selected_draft() {
        let mut state = State::default();
        state.drafts.extend((2..=12).map(Draft::new));
        let mut runtime = Runtime::new(state, workspace::view, (640.0, 490.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        click(&mut runtime, "request-1");
        press(&mut runtime, Key::Down);
        assert_focus(&runtime, "request-2");
        assert_eq!(runtime.state.draft().id, 2);
        press(&mut runtime, Key::End);
        assert_focus(&runtime, "request-12");
        assert_eq!(runtime.state.draft().id, 12);
        press(&mut runtime, Key::Home);
        assert_focus(&runtime, "request-1");
        press(&mut runtime, Key::Tab);
        assert_focus(&runtime, "request-name");
    }

    #[test]
    fn import_escape_and_close_restore_focus_to_visible_controls() {
        let mut runtime = Runtime::new(
            State::default(),
            workspace::view,
            (640.0, 490.0),
            Env::new(true, 1.0),
        );
        runtime.frame(0.0);
        click(&mut runtime, "import");
        assert_focus(&runtime, "Postman collection");
        runtime.state.import_text.text = "temporary input".into();
        press(&mut runtime, Key::Escape);
        assert!(!runtime.state.import_open);
        assert!(runtime.state.import_text.text.is_empty());
        assert_focus(&runtime, "import");
        press(&mut runtime, Key::Tab);
        assert_focus(&runtime, "request-1");
        click(&mut runtime, "new");
        assert_focus(&runtime, "url");
        for _ in 0..2 {
            runtime.key(KeyEvent {
                key: Key::Tab,
                mods: rune::Mods {
                    shift: true,
                    ..Default::default()
                },
            });
            runtime.frame(0.0);
        }
        assert_focus(&runtime, "close");
        press(&mut runtime, Key::Enter);
        assert_eq!(runtime.state.drafts.len(), 1);
        assert_focus(&runtime, "request-1");
    }

    #[test]
    fn keyboard_opens_selects_and_dismisses_method_and_theme_menus() {
        let mut runtime = Runtime::new(
            State::default(),
            workspace::view,
            (640.0, 490.0),
            Env::new(true, 1.0),
        );
        runtime.frame(0.0);
        press(&mut runtime, Key::Tab);
        assert_focus(&runtime, "theme-trigger");
        press(&mut runtime, Key::Enter);
        assert_eq!(runtime.state.menu, Some("theme"));
        press(&mut runtime, Key::Escape);
        assert_eq!(runtime.state.menu, None);
        assert_focus(&runtime, "theme-trigger");
        for _ in 0..5 {
            press(&mut runtime, Key::Tab);
        }
        assert_focus(&runtime, "method-trigger");
        press(&mut runtime, Key::Enter);
        assert_eq!(runtime.state.menu, Some("method"));
        press(&mut runtime, Key::Down);
        press(&mut runtime, Key::Enter);
        assert_eq!(runtime.state.draft().method, "POST");
        assert_eq!(runtime.state.menu, None);
        assert_focus(&runtime, "method-trigger");
    }

    #[test]
    fn close_request_button_is_clickable_after_a_new_request() {
        let mut runtime = Runtime::new(
            State::default(),
            workspace::view,
            (640.0, 490.0),
            Env::new(true, 1.0),
        );
        runtime.frame(0.0);
        click(&mut runtime, "new");
        runtime.frame(0.25);
        click(&mut runtime, "close");
        assert_eq!(runtime.state.drafts.len(), 1);
        assert_focus(&runtime, "request-1");
    }

    #[test]
    fn keyboard_response_views_and_scrolling_work_in_every_theme_at_minimum_size() {
        for &theme in THEMES {
            for scale in [1.0, 1.25, 1.5, 2.0] {
                let mut state = State {
                    theme: theme.to_owned(),
                    ..State::default()
                };
                state.draft_mut().response = Some(Response {
                    status: 200,
                    reason: "OK",
                    elapsed_ms: 5,
                    bytes: 800,
                    truncated: false,
                    headers: "content-type: text/plain".into(),
                    content_type: "text/plain".into(),
                    body: "Sample response\n".repeat(50),
                    pretty_body: None,
                });
                let mut runtime = Runtime::new(
                    state,
                    workspace::view,
                    (640.0, 490.0),
                    Env::new(theme != "Paper", scale),
                );
                runtime.frame(0.0);
                click(&mut runtime, "edit-Parameters");
                press(&mut runtime, Key::End);
                assert_focus(&runtime, "edit-Auth");
                assert_eq!(runtime.state.editor, "Auth");
                click(&mut runtime, "view-body");
                press(&mut runtime, Key::Right);
                assert_focus(&runtime, "view-raw");
                assert!(runtime.state.response_view == ResponseView::Raw);
                press(&mut runtime, Key::End);
                assert_focus(&runtime, "view-headers");
                assert!(runtime.state.response_view == ResponseView::Headers);
                press(&mut runtime, Key::Home);
                assert_focus(&runtime, "view-body");
                press(&mut runtime, Key::Tab);
                assert_focus(&runtime, "copy");
                press(&mut runtime, Key::Tab);
                assert_focus(&runtime, "response-body");
                assert_eq!(runtime.scroll_at_bottom("response-body"), Some(false));
                press(&mut runtime, Key::End);
                assert_eq!(runtime.scroll_at_bottom("response-body"), Some(true));
                press(&mut runtime, Key::Home);
                assert_eq!(runtime.scroll_at_bottom("response-body"), Some(false));
            }
        }
    }

    #[test]
    fn auth_indicator_follows_the_draft_and_keeps_credentials_out_of_ui_metadata() {
        let mut state = State::default();
        state.draft_mut().auth = "Bearer".into();
        state.draft_mut().secret = TextEdit::new("fixture-user").secure();
        let mut admin = Draft::new(2);
        admin.auth = "Bearer".into();
        admin.secret = TextEdit::new("fixture-admin").secure();
        state.drafts.extend([admin, Draft::new(3)]);
        let mut runtime = Runtime::new(state, workspace::view, (640.0, 490.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        for (id, credential) in [(1, "fixture-user"), (2, "fixture-admin")] {
            click(&mut runtime, &format!("request-{id}"));
            assert!(runtime.elements().iter().any(|element| {
                element.key.as_deref() == Some("edit-Auth")
                    && element.label.as_deref() == Some("Auth · Bearer")
            }));
            click(&mut runtime, "edit-Auth");
            let secret = runtime
                .elements()
                .into_iter()
                .find(|element| element.key.as_deref() == Some("secret"))
                .unwrap();
            assert!(secret.text.is_none());
            assert!(matches!(
                runtime.state.draft().request().unwrap().auth,
                Auth::Bearer(value) if value == credential
            ));
        }
        click(&mut runtime, "request-3");
        assert!(matches!(
            runtime.state.draft().request().unwrap().auth,
            Auth::None
        ));
        assert!(runtime.elements().iter().any(|element| {
            element.key.as_deref() == Some("edit-Auth") && element.label.as_deref() == Some("Auth")
        }));
    }

    #[test]
    fn keyboard_focus_stays_on_the_request_action_during_cancellation() {
        let server = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let mut state = State::default();
        state.draft_mut().url = TextEdit::new(format!("http://{}", server.local_addr().unwrap()));
        state.drafts.push(Draft::new(2));
        let mut runtime = Runtime::new(state, workspace::view, (640.0, 490.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        click(&mut runtime, "url");
        press(&mut runtime, Key::Tab);
        assert_focus(&runtime, "request-action");
        press(&mut runtime, Key::Enter);
        assert!(runtime.state.active.is_some());
        assert_focus(&runtime, "request-action");
        click(&mut runtime, "request-2");
        assert_eq!(runtime.state.draft().id, 2);
        let action = runtime
            .elements()
            .into_iter()
            .find(|element| element.key.as_deref() == Some("request-action"))
            .unwrap();
        assert_eq!(action.label.as_deref(), Some("View active request"));
        click(&mut runtime, "url");
        press(&mut runtime, Key::Tab);
        press(&mut runtime, Key::Enter);
        assert_eq!(runtime.state.draft().id, 1);
        assert!(runtime.state.active.is_some());
        assert_focus(&runtime, "request-action");
        press(&mut runtime, Key::Enter);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !runtime.state.poll() {
            assert!(
                std::time::Instant::now() < deadline,
                "request stopped responding"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        runtime.frame(0.0);
        assert!(runtime.state.active.is_none());
        assert!(
            runtime
                .state
                .draft()
                .outcome
                .to_lowercase()
                .contains("cancel")
        );
        assert_focus(&runtime, "request-action");
    }
}
