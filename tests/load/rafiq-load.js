import http from 'k6/http';
import {check,sleep} from 'k6';
import {Rate,Trend,Counter} from 'k6/metrics';
const statusCounts=new Counter('http_status_codes');

const BASE=__ENV.BASE_URL||'https://rafiq-o6qd.onrender.com';
const errors=new Rate('rafiq_errors');
const latency200=new Trend('rafiq_latency_200');
const latency500=new Trend('rafiq_latency_500');
const latency1000=new Trend('rafiq_latency_1000');
const paths=['/','/app.html','/services.html','/caregivers.html','/api/status'];

function hit(loadLevel){
  for(const path of paths){
    const r=http.get(BASE+path,{
      tags:{path,load_level:String(loadLevel)},
      headers:{'X-Forwarded-For':`198.18.${Math.floor((__VU-1)/256)}.${((__VU-1)%256)+1}`}
    });
    statusCounts.add(1,{code:String(r.status),load_level:String(loadLevel),path});
    const ok=check(r,{'status < 500':x=>x.status<500,'latency < 5s':x=>x.timings.duration<5000});
    errors.add(!ok,{path,load_level:String(loadLevel)});
    if(loadLevel===200)latency200.add(r.timings.duration,{path});
    if(loadLevel===500)latency500.add(r.timings.duration,{path});
    if(loadLevel===1000)latency1000.add(r.timings.duration,{path});
  }
  sleep(0.2);
}

export const options={
  scenarios:{
    users200:{executor:'constant-vus',vus:200,duration:'60s',startTime:'0s',exec:'load200'},
    users500:{executor:'constant-vus',vus:500,duration:'60s',startTime:'65s',exec:'load500'},
    users1000:{executor:'constant-vus',vus:1000,duration:'60s',startTime:'130s',exec:'load1000'}
  },
  thresholds:{
    'http_req_failed{load_level:500}':['rate<0.01'],
    'rafiq_errors{load_level:500}':['rate<0.01'],
    'rafiq_latency_500':['p(95)<2000'],
    'rafiq_latency_200':['p(95)<2000']
  },
  noConnectionReuse:false
};

export function load200(){hit(200)}
export function load500(){hit(500)}
export function load1000(){hit(1000)}
