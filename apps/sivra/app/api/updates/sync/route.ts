import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const SMOOBU_API = "https://login.smoobu.com/api/reservations"
const BOOKING_NET_FACTOR = 0.8028 // Booking agency model: net = gross × 0.8028
const API_KEY = process.env.SMOOBU_API_KEY || ""

const PORTAL_MAP: Record<string, string> = {
  "Booking.com": "BOOKING",
  "Airbnb": "AIRBNB",
  "VRBO / HomeAway": "VRBO",
  "VRBO": "VRBO",
  "Expedia": "EXPEDIA",
  "Agoda": "AGODA",
  "Reserva directa": "DIRECTO",
  "Sitio web": "DIRECTO",
}

function parseDate(s?: string): Date | null {
  if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d
	}
function nights(ci: Date|null, co: Date|null) { return ci&&co?Math.round((co.getTime()-ci.getTime())/86400000):0 }
async function fetchPage(p:number,from:string){const res=await fetch(`https://login.smoobu.com/api/reservations?pageSize=100&page=${p}&modifiedFrom=${from}`,{headers:{"Api-Key":API_KEY},cache:"no-store"});if(!res.ok)throw new Error(`Smoobu ${res.status}`);const d=await res.json();return{bookings:d.bookings||[],pageCount:d.page_count||1}}
async function runSync(days:number){if(!API_KEY)throw new Error("SMOOBU_API_KEY no configurada");const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10);let page=1,total=1,all:any[]=[];do{const{bookings,pageCount}=await fetchPage(page,from);all=[...all,...bookings];total=pageCount;page++}while(page<=total&&page<=20);const props=await prisma.property.findMany();const byName=new Map(props.map(p=>[p.name.toLowerCase().trim(),p.id]));const cnt={new:0,modified:0,cancelled:0,skipped:0};const logs:any[]=[];for(const b of all){if(b["is-blocked-booking"]){cnt.skipped++;continue};const rid=String(b.id);const ci=parseDate(b.arrival);const co=parseDate(b.departure);const amtGross=typeof b.price==="string"?parseFloat(b.price):(b.price||0);const portal_tmp=PORTAL_MAP[b.channel?.name||""]||"OTRO";const amt=portal_tmp==="BOOKING"?Math.round(amtGross*BOOKING_NET_FACTOR*100)/100:amtGross;const portal=portal_tmp;const isCancel=b.type==="cancellation";let pid:(string|null)=null;if(b.apartment?.name){const k=b.apartment.name.toLowerCase().trim();pid=byName.get(k)||null;if(!pid)for(const [n,i] of byName)if(n.includes(k)||k.includes(n)){pid=i;break}};const ex=await prisma.income.findUnique({where:{reservationId:rid}});if(isCancel){if(ex){await prisma.income.delete({where:{id:ex.id}});logs.push({reservationId:rid,propertyId:ex.propertyId,type:"cancelled",guestName:ex.guestName,portal:ex.portal,amount:ex.amount,checkIn:ex.checkIn,checkOut:ex.checkOut,changes:null});cnt.cancelled++}else cnt.skipped++;continue};if(!ci||!pid){cnt.skipped++;continue};if(!ex){await prisma.income.create({data:{propertyId:pid,date:ci,amount:amt,portal:portal as any,reservationId:rid,guestName:b["guest-name"]||null,checkIn:ci,checkOut:co,nights:nights(ci,co)}});logs.push({reservationId:rid,propertyId:pid,type:"new",guestName:b["guest-name"]||null,portal,amount:amt,checkIn:ci,checkOut:co,changes:null});cnt.new++}else{const ch={} as any;if(Math.abs(ex.amount-amt)>0.01)ch.amount={before:ex.amount,after:amt};if(ex.checkIn?.toISOString().slice(0,10)!==ci?.toISOString().slice(0,10))ch.checkIn={before:ex.checkIn,after:ci};if(Object.keys(ch).length>0){await prisma.income.update({where:{id:ex.id},data:{amount:amt,checkIn:ci,checkOut:co,nights:nights(ci, co),portal:portal as any}});logs.push({reservationId:rid,propertyId:ex.propertyId,type:"modified",guestName:b["guest-name"]||null,portal,amount:amt,checkIn:ci,checkOut:co,changes:ch});cnt.modified++}else cnt.skipped++}};if(logs.length>0)await prisma.updateLog.createMany({data:logs});return{success:true,message:`${cnt.new} nuevas,${cnt.modified} modificadas,${cnt.cancelled} canceladas`,...cnt,total:all.length,since:from}}
export async function POST(req:Request){try{const b=await req.json().catch(()=>({}));return NextResponse.json(await runSync(b.days||2))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}}
export async function GET(){try{return NextResponse.json(await runSync(2))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}}
