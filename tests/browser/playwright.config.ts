import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'.',timeout:45000,fullyParallel:true,retries:1,
 reporter:[['html',{outputFolder:'playwright-report'}],['json',{outputFile:'playwright-results.json'}]],
 projects:[
  {name:'chromium',use:{...devices['Desktop Chrome'],baseURL:process.env.BASE_URL||'https://rafiq-o6qd.onrender.com'}},
  {name:'webkit',use:{...devices['Desktop Safari'],baseURL:process.env.BASE_URL||'https://rafiq-o6qd.onrender.com'}},
  {name:'android',use:{...devices['Pixel 5'],baseURL:process.env.BASE_URL||'https://rafiq-o6qd.onrender.com'}},
  {name:'iphone',use:{...devices['iPhone 13'],baseURL:process.env.BASE_URL||'https://rafiq-o6qd.onrender.com'}}
 ]
});
