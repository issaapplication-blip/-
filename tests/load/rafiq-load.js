import http from 'k6/http';
import {check,sleep} from 'k6';
import {Rate,Trend} from 'k6/metrics';

const BASE=__ENV.BASE_URL||'https://rafiq-o6qd.onrender.com';
const errors=new Rate('rafiq_errors');
const pageLatency=new Trend('rafiq_page_latency',{trend:'p(95)'});
const paths=['/','/app.html','/services.html','/caregivers.html','/api/status'];
export const options={
  scenarios:{
    staged:{executor:'ramping-vus',startVUs:0,stages:[
      {duration:'30s',target:200},{duration:'60s',target:200},
      {duration:'30s',target:500},{duration:'60s',target:500},
      {duration:'30s',target:1000},{duration:'60s',target:1000},
      {duration:'30s',target:0}]}
  },
  thresholds:{
    http_req_failed:['rate<0.01'],
    http_req_duration:['p(95)<2000'],
    rafiq_errors:['rate<0.01']
  },
  noConnectionReuse:false
};
export default function(){
  for(const path of paths){
    const r=http.get(BASE+path,{tags:{path}});
    pageLatency.add(r.timings.duration,{path});
    const ok=check(r,{'status < 500':x=>x.status<500,'latency < 5s':x=>x.timings.duration<5000});
    errors.add(!ok,{path});
  }
  sleep(0.2);
}
