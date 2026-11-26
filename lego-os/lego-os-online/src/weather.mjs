import {requestJSON} from './models.mjs';

const openMeteo='https://api.open-meteo.com/v1/forecast';
const locationForecast='https://api.met.no/weatherapi/locationforecast/2.0/complete';
const attribution='MET Norway · Locationforecast';
const siteTimeZone='Asia/Shanghai';

function weatherCode(symbol='') {
  if(symbol.includes('thunder'))return 95;
  if(symbol.includes('sleet'))return 66;
  if(symbol.includes('snow'))return symbol.includes('heavy')?75:71;
  if(symbol.includes('rain'))return symbol.includes('showers')?80:symbol.includes('heavy')?65:61;
  if(symbol.startsWith('fog'))return 45;
  if(symbol.startsWith('partlycloudy'))return 2;
  if(symbol.startsWith('cloudy'))return 3;
  if(symbol.startsWith('fair'))return 1;
  if(symbol.startsWith('clearsky'))return 0;
  return null;
}

export function convertLocationForecast(body,timeZone=siteTimeZone) {
  const time=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const series=(body.properties?.timeseries||[]).map(({time:stamp,data})=>{
    const metrics=data.instant.details;
    const interval=data.next_1_hours||data.next_6_hours;
    const symbol=interval?.summary?.symbol_code;
    return {time:time.format(new Date(stamp)).replace(' ','T'),temperature_2m:metrics.air_temperature,
      relative_humidity_2m:metrics.relative_humidity,apparent_temperature:metrics.apparent_air_temperature,
      weather_code:weatherCode(symbol),is_day:symbol?.includes('night')?0:1,
      wind_speed_10m:metrics.wind_speed==null?null:Math.round(metrics.wind_speed*36)/10,
      precipitation_probability:interval?.details?.probability_of_precipitation,
      uv_index:metrics.ultraviolet_index_clear_sky};
  });
  if(!series.length)throw Error('天气源未返回预报');
  const dates=new Map();
  for(const row of series){
    const day=row.time.slice(0,10);
    if(!dates.has(day))dates.set(day,[]);
    dates.get(day).push(row);
  }
  const hourly={};
  for(const key of ['time','temperature_2m','relative_humidity_2m','weather_code','is_day','precipitation_probability']){
    hourly[key]=series.map(row=>row[key]??null);
  }
  const daily={time:[],temperature_2m_max:[],temperature_2m_min:[],weather_code:[],uv_index_max:[],precipitation_probability_max:[]};
  const max=values=>values.length?Math.max(...values):null;
  for(const [day,rows] of [...dates].slice(0,7)){
    const temperatures=rows.map(row=>row.temperature_2m).filter(Number.isFinite);
    daily.time.push(day);
    daily.temperature_2m_max.push(max(temperatures));
    daily.temperature_2m_min.push(temperatures.length?Math.min(...temperatures):null);
    daily.weather_code.push(rows.find(row=>row.time.slice(11,13)>='12'&&row.weather_code!==null)?.weather_code??rows[0].weather_code);
    daily.uv_index_max.push(max(rows.map(row=>row.uv_index).filter(Number.isFinite)));
    daily.precipitation_probability_max.push(max(rows.map(row=>row.precipitation_probability).filter(Number.isFinite)));
  }
  return {current:series[0],hourly,daily,timezone:timeZone};
}

export async function weather(p,origin) {
  const lat=Number(p.lat),lon=Number(p.lon);
  if(p.lat==null||p.lon==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('请选择有效位置');
  const location={name:String(p.locationName||'浏览器定位').slice(0,120),lat,lon};
  const coordinates={latitude:lat.toFixed(4),longitude:lon.toFixed(4)};
  const query=new URLSearchParams({...coordinates,current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly:'temperature_2m,precipitation_probability,relative_humidity_2m,weather_code,is_day',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',timezone:'auto',forecast_days:7});
  const cache=origin&&globalThis.caches?.default;
  const cacheKey=provider=>new Request(origin+'/_weather-cache/'+provider+'?'+new URLSearchParams(coordinates));
  const read=async provider=>{
    const hit=await cache?.match(cacheKey(provider)).catch(()=>undefined);
    return hit?.json();
  };
  const save=async(provider,data,ttl)=>{
    if(cache)await cache.put(cacheKey(provider),new Response(JSON.stringify(data),{
      headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+ttl}
    })).catch(()=>{});
    return data;
  };
  const open=await read('open-meteo');
  const backup=await read('met');
  if(open||backup)return {...(open||backup),location};

  try {
    const result=await requestJSON(openMeteo+'?'+query);
    const data={type:'weather',source:'Open-Meteo · 数值天气模型',result,at:Date.now()/1000};
    return {...await save('open-meteo',data,900),location};
  }catch{
    try{
      const result=await requestJSON(locationForecast+'?'+new URLSearchParams({lat:coordinates.latitude,lon:coordinates.longitude}),
        undefined,{'User-Agent':'MyCraft Lego OS/1.0 ('+origin+')'});
      const data={type:'weather',source:attribution,result:convertLocationForecast(result),at:Date.now()/1000};
      return {...await save('met',data,10800),location};
    }catch{
      throw Error('天气数据源暂时不可用，请稍后重试');
    }
  }
}
