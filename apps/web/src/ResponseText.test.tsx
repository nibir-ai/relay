import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ResponseText from "./ResponseText";
afterEach(cleanup);
it("preserves exact response text and renders HTML-looking payloads safely", () => {
  const text = '{"value":"<script>alert(1)</script>","count":12,"valid":true}';
  const { container } = render(
    <pre>
      <ResponseText text={text} />
    </pre>,
  );
  expect(container.textContent).toBe(text);
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector(".json-number")).toHaveTextContent("12");
});
