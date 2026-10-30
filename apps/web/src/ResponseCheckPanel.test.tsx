import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ResponseChecks, { type CheckDraft } from "./ResponseCheckPanel";
import type { LiveResponse } from "./types";
afterEach(cleanup);
const response: LiveResponse = {status:200,reason:"OK",duration_ms:2,body:'{"data":{"role":"user"}}',headers:{},bytes:24,truncated:false,content_type:"application/json",url:"/me",method:"GET"};
function Panel({ result = response, busy = false }: { result?: LiveResponse | null; busy?: boolean }) {
 const [value,onChange] = useState<CheckDraft[]>([]);
 return <ResponseChecks value={value} onChange={onChange} response={result} busy={busy}/>;
}
const open = () => fireEvent.click(screen.getByText("Response checks"));
it("checks only on explicit action and invalidates results after edits or a new response", () => {
 const {rerender}=render(<Panel/>);open();
 fireEvent.click(screen.getByRole("button",{name:"Add check"}));
 expect(screen.queryByText("Passed")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Passed")).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Expected status"),{target:{value:"201"}});expect(screen.queryByText("Passed")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Failed")).toBeInTheDocument();
 rerender(<Panel result={{...response,status:201}}/>);expect(screen.queryByText("Failed")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Passed")).toBeInTheDocument();
});
it("supports JSON values, missing fields, unavailable bodies and configuration errors", () => {
 const {rerender}=render(<Panel/>);open();fireEvent.click(screen.getByRole("button",{name:"Add check"}));
 fireEvent.change(screen.getByLabelText("Type"),{target:{value:"equals"}});
 fireEvent.change(screen.getByLabelText(/^JSON Pointer/),{target:{value:"/data/role"}});
 fireEvent.change(screen.getByLabelText("Expected JSON value"),{target:{value:'"user"'}});
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Passed")).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Expected JSON value"),{target:{value:"user"}});
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Invalid check")).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText("Type"),{target:{value:"exists"}});
 fireEvent.change(screen.getByLabelText(/^JSON Pointer/),{target:{value:"/missing"}});
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Field is missing.")).toBeInTheDocument();
 rerender(<Panel result={{...response,truncated:true}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Check response"}));expect(screen.getByText("Unavailable")).toBeInTheDocument();
});
it("bounds configuration, clears it, returns focus and requires a completed response", () => {
 const {rerender}=render(<Panel result={null}/>);open();
 for(let i=0;i<10;i++)fireEvent.click(screen.getByRole("button",{name:"Add check"}));
 expect(screen.getByRole("button",{name:"Add check"})).toBeDisabled();expect(screen.getByRole("button",{name:"Check response"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Remove check 1"}));expect(document.activeElement?.tagName).toBe("SUMMARY");
 rerender(<Panel busy/>);expect(screen.getByRole("button",{name:"Check response"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Clear checks"}));expect(screen.queryByRole("group",{name:/Check \d/})).not.toBeInTheDocument();expect(document.activeElement?.tagName).toBe("SUMMARY");
});
