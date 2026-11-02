export type ResponseData={status:number;reason:string;body:string;headers:Record<string,string|string[]>;bytes:number;captured_bytes:number;truncated:boolean;duration_ms:number;content_type:string};
export type RequestInput={id:string;url:string;method:string;headers:Record<string,string>;body:string};
declare global {interface Window {relayDesktop?:{execute:(input:RequestInput)=>Promise<{response?:ResponseData;error?:string}>;cancel:(id:string)=>Promise<boolean>;copy:(text:string)=>Promise<boolean>}}}
