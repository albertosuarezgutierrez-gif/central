import{NextResponse}from"next/server"
import{prisma}from"@/lib/prisma"
export const dynamic="force-dynamic"
export async function GET(){try{return NextResponse.json({properties:await prisma.property.findMany({orderBy:{name:"asc"}})})}catch(e){return NextResponse.json({error:String(e)},{status:500})}}