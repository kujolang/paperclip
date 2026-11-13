import {chromium,expect} from '@playwright/test';
import {join} from 'node:path';
export async function captureAssuranceUi({base,cookie,issueId,root}){
 const browser=await chromium.launch();let page;try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addCookies(cookie.split('; ').map(item=>{const i=item.indexOf('=');return {name:item.slice(0,i),value:item.slice(i+1),url:base};}));
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 page=await context.newPage();await page.goto(`${base}/issues/${issueId}`);
 const panel=page.getByRole('region',{name:'Verification Center'});await expect(panel).toBeVisible({timeout:30000});
 await panel.getByRole('button',{name:'Check acceptance',exact:true}).click();await expect(panel.getByLabel('Acceptance result')).toContainText('passed');
 await panel.getByRole('button',{name:'Inspect delegated evidence',exact:true}).click();await expect(panel.getByLabel('Native delegated evidence')).toContainText('Search task list');
 await panel.screenshot({path:join(root,'verification-center.png')});
 await panel.getByRole('button',{name:'Refresh verification',exact:true}).click();
 await expect(panel.getByRole('region',{name:'Verification attempts'}).getByRole('listitem').first()).toContainText('Requested by');
 await expect(panel.getByRole('button',{name:'Refresh verification',exact:true})).toBeEnabled();
 await expect(panel.getByLabel('Acceptance result')).toContainText('passed');
 await panel.getByRole('region',{name:'Verification attempts'}).screenshot({path:join(root,'verification-attempts.png')});
 }catch(error){await page?.screenshot({path:join(root,'verification-center-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
}
