import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import AuthPanel from "./AuthPanel";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
it("applies a pasted Bearer token in one action, normalized and masked", () => {
  const save = vi.fn(),
    close = vi.fn();
  render(
    <AuthPanel
      auth={{ token: "", enabled: false }}
      save={save}
      close={close}
    />,
  );
  const input = screen.getByLabelText("Bearer token");
  expect(input).toHaveAttribute("type", "password");
  fireEvent.change(input, { target: { value: "Bearer abc" } });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Authorize" }));
  expect(save).toHaveBeenCalledWith({ token: "abc", enabled: true });
  expect(close).toHaveBeenCalled();
});
it("cancels without applying edited credentials", () => {
  const save = vi.fn(), close = vi.fn();
  render(<AuthPanel auth={{ token: "old", enabled: true }} save={save} close={close} />);
  fireEvent.change(screen.getByLabelText("Bearer token"), {target:{value:"replacement"}});
  fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
  expect(save).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
it("rejects an empty token and keeps the dialog open", () => {
  const save = vi.fn(), close = vi.fn();
  render(<AuthPanel auth={{token:"",enabled:false}} save={save} close={close} />);
  fireEvent.click(screen.getByRole("button", {name:"Authorize"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Paste a valid bearer token");
  expect(save).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it("clears workspace credentials explicitly", () => {
  const save = vi.fn();
  render(
    <AuthPanel
      auth={{ token: "abc", enabled: true }}
      save={save}
      close={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear token" }));
  expect(save).toHaveBeenCalledWith({ token: "", enabled: false });
});
