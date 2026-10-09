export default function ResponseText({ text }: { text: string }) {
  if (text.length > 200_000 || !/^[\s]*[\[{]/.test(text)) return text;
  try {
    JSON.parse(text);
  } catch {
    return text;
  }
  const tokens = text.split(
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
  );
  return tokens.map((token, index) => {
    if (index % 2 === 0) return token;
    const next = tokens[index + 1] ?? "";
    const kind = token.startsWith('"')
      ? /^\s*:/.test(next)
        ? "key"
        : "string"
      : /^(true|false|null)$/.test(token)
        ? "literal"
        : "number";
    return (
      <span className={`json-${kind}`} key={index}>
        {token}
      </span>
    );
  });
}
