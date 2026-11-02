import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import DesktopApp from '../../desktop/src/App';
import type {ResponseData} from '../../desktop/src/types';

const response:ResponseData={status:200,reason:'OK',body:'{"previous":true}',headers:{},bytes:17,captured_bytes:17,truncated:false,duration_ms:2,content_type:'application/json'};
afterEach(()=>{cleanup();delete window.relayDesktop;});

it('clears the old successful capture when the next request is cancelled',async()=>{
 let finish!:(result:{error:string})=>void;
 const execute=vi.fn().mockResolvedValueOnce({response}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 window.relayDesktop={execute,cancel:vi.fn(async()=>{finish({error:'Request cancelled.'});return true;}),copy:vi.fn()};
 render(<DesktopApp/>);
 fireEvent.change(screen.getByLabelText('Request URL'),{target:{value:'http://localhost/first'}});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 expect(screen.getByRole('region',{name:'Response'}).textContent).toContain('200 OK');
 fireEvent.change(screen.getByLabelText('Request URL'),{target:{value:'http://localhost/slow'}});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 expect(screen.getByRole('region',{name:'Response'}).textContent).not.toContain('previous');
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Cancel'}));});
 expect(screen.getByRole('alert').textContent).toBe('Request cancelled.');
 const result=within(screen.getByRole('region',{name:'Response'}));
 expect(result.queryByText('200 OK')).toBeNull();
 expect(result.queryByRole('button',{name:'Copy'})).toBeNull();
 expect(result.getByText('No response received')).toBeTruthy();
});

it.each(['Connection refused. Check the address and server.','TLS certificate validation failed. Check the server certificate.'])('does not show old success after %s',async error=>{
 const execute=vi.fn().mockResolvedValueOnce({response}).mockResolvedValueOnce({error});
 window.relayDesktop={execute,cancel:vi.fn(),copy:vi.fn()};
 render(<DesktopApp/>);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 expect(screen.getByRole('region',{name:'Response'}).textContent).toContain('200 OK');
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 expect(screen.getByRole('alert').textContent).toBe(error);
 expect(screen.getByRole('region',{name:'Response'}).textContent).not.toContain('200 OK');
 expect(screen.queryByRole('button',{name:'Copy'})).toBeNull();
});

it('clears the old response when invalid headers prevent the next attempt',async()=>{
 const execute=vi.fn().mockResolvedValue({response});
 window.relayDesktop={execute,cancel:vi.fn(),copy:vi.fn()};
 render(<DesktopApp/>);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 fireEvent.change(screen.getByLabelText('Request headers'),{target:{value:'{broken'}});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Send'}));});
 expect(execute).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('alert').textContent).toContain('valid JSON object');
 expect(screen.getByRole('region',{name:'Response'}).textContent).not.toContain('previous');
});
