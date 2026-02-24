
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
            // HWPX files are ZIP archives containing XML
            // For now, return a helpful error message
            return NextResponse.json({
                sections: [],
                error: "HWPX 파일은 현재 템플릿으로만 사용 가능합니다. PDF 파일을 업로드해주세요."
            });
        } else {
            // Try to treat as plain text
            text = buffer.toString('utf-8');
        }

        // Analyze hierarchy from text
        const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        const sections: { id: string; title: string; depth: number }[] = [];

        lines.forEach((line: string) => {
            // Heuristic for 1depth: "1. ", "Ⅰ. ", "① ", "■ ", "가. "
            const is1depth = /^([0-9]|Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|가|나|다|라|[①-⑩]|■)[\.\s]/.test(line);

            if (is1depth) {
                sections.push({
                    id: `s${sections.length + 1}`,
                    title: line,
                    depth: 1
                });
            }
            // Heuristic for 2depth: Detailed items
            else if (line.length > 3 && line.length < 60 && !line.endsWith('.') && !line.endsWith('다')) {
                sections.push({
                    id: `s${sections.length + 1}`,
                    title: line,
                    depth: 2
                });
            }
        });

        if (sections.length === 0) {
            return NextResponse.json({
                sections: [],
                error: "문서에서 뼈대(구조)를 감지하지 못했습니다. PDF 내용이 이미지 형식일 수 있습니다."
            });
        }

        return NextResponse.json({ sections });
    } catch (error: any) {
        console.error("PDF Analysis Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
