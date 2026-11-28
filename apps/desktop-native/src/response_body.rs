const LIMIT: usize = 32 * 1024;

pub struct JsonPreview {
    pub text: String,
    pub strings: Vec<StringToken>,
}

pub struct StringToken {
    pub start: usize,
    pub end: usize,
    pub is_key: bool,
}

pub fn pretty_json(raw: &str) -> Option<JsonPreview> {
    if raw.len() > LIMIT || serde_json::from_str::<serde_json::Value>(raw).is_err() {
        return None;
    }
    let mut pretty = String::with_capacity(raw.len());
    let mut strings = Vec::<StringToken>::new();
    let mut depth = 0;
    let mut in_string = false;
    let mut string_start = 0;
    let mut escaped = false;
    let mut previous = '\0';
    for ch in raw.chars() {
        if in_string {
            pretty.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
                if strings.len() < 256 {
                    strings.push(StringToken {
                        start: string_start,
                        end: pretty.len(),
                        is_key: false,
                    });
                }
            }
            continue;
        }
        if ch.is_ascii_whitespace() {
            continue;
        }
        if matches!(ch, '}' | ']') {
            depth -= 1;
        }
        let after_open = matches!(previous, '{' | '[');
        let before_close = matches!(ch, '}' | ']');
        if previous == ',' || after_open != before_close {
            pretty.push('\n');
            pretty.extend(std::iter::repeat_n(' ', depth * 2));
        }
        pretty.push(ch);
        if ch == ':' {
            let string_end = pretty.len() - 1;
            if let Some(token) = strings.last_mut().filter(|token| token.end == string_end) {
                token.is_key = true;
            }
            pretty.push(' ');
        } else if ch == '"' {
            in_string = true;
            string_start = pretty.len() - 1;
        } else if matches!(ch, '{' | '[') {
            depth += 1;
        }
        if pretty.len() > LIMIT {
            return None;
        }
        previous = ch;
    }
    (pretty.len() <= LIMIT).then_some(JsonPreview {
        text: pretty,
        strings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_whitespace_without_changing_literals_or_duplicate_keys() {
        let raw =
            r#"{ "n":9007199254740993,"n":-0.5e+2,"s":"a \" b", "nested":[{}, {"x":1}, [2, 3]] }"#;
        let preview = pretty_json(raw).unwrap();
        let formatted = preview.text;
        assert_eq!(formatted.matches("\"n\"").count(), 2);
        assert!(formatted.contains("9007199254740993"));
        assert!(formatted.contains("-0.5e+2"));
        assert!(formatted.contains(r#""a \" b""#));
        assert!(formatted.contains("\n    {},\n    {\n      \"x\": 1\n    }"));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(raw).unwrap(),
            serde_json::from_str::<serde_json::Value>(&formatted).unwrap()
        );
        assert!(pretty_json("{incomplete").is_none());
        assert_eq!(
            preview.strings.iter().filter(|token| token.is_key).count(),
            5
        );
    }
}
