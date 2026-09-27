// Offline toy model: no browser, network, processor SDK, money or card data.
function apply(state,event,{verify=true,dedupe=true}={}){
 if(verify&&(!event.verified||event.order!==state.order||event.amount!==state.amount||event.currency!==state.currency||event.status!=='succeeded'))return state;
 if(dedupe&&state.processed.includes(event.id))return state;
 return {...state,fulfillments:state.fulfillments+1,processed:[...state.processed,event.id]};
}
function demo(){
 const base={order:'synthetic-order',amount:2500,currency:'USD',fulfillments:0,processed:[]};
 const valid={id:'synthetic-event',order:base.order,amount:2500,currency:'USD',status:'succeeded',verified:true};
 return [
 {case:'valid payment',expected:1,actual:apply(base,valid).fulfillments},
 {case:'duplicate delivery',expected:1,actual:apply(apply(base,valid),valid).fulfillments},
 {case:'unverified completion',expected:0,actual:apply(base,{...valid,verified:false}).fulfillments},
 {case:'mismatched amount',expected:0,actual:apply(base,{...valid,amount:1}).fulfillments},
 {case:'seeded no-dedupe defect',expected:1,actual:apply(apply(base,valid),valid,{dedupe:false}).fulfillments}
 ];
}
module.exports={apply,demo};if(require.main===module)console.log(JSON.stringify({kind:'offline-toy-model',results:demo()},null,2));
