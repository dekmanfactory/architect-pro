
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let text = "";

        // Check file type
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.pdf')) {
            // Handle PDF files
            const pdf = require("pdf-parse/lib/pdf-parse.js");
            const data = await pdf(buffer);
            text = data.text;
        } else if (fileName.endsWith('.hwpx') || fileName.endsWith('.hwp')) {
            // HWPX files are not supported for text extraction
            return NextResponse.json({
                error: "HWPX 파일은 텍스트 추출이 지원되지 않습니다. PDF 파일을 업로드해주세요."
            }, { status: 400 });
        } else {
            // Try to treat as plain text
            text = buffer.toString('utf-8');
        }

        return NextResponse.json({ text });
    } catch (error: any) {
        console.error("Text Extraction Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
