import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export async function generateWotBatchPdf(wots: any[]) {
    // Create a new jsPDF instance (A4, portrait)
    // A4 dimensions: 210 x 297 mm
    const doc = new jsPDF("p", "mm", "a4");

    // Layout configuration
    const cols = 2; // 2 labels per row
    const labelWidth = 90;
    const labelHeight = 50;
    const marginX = 15;
    const marginY = 15;
    const gapX = 10;
    const gapY = 10;

    const rowsPerPage = 5;

    for (let i = 0; i < wots.length; i++) {
        const wot = wots[i];
        
        // Calculate position
        const pageIndex = Math.floor(i / (cols * rowsPerPage));
        const indexOnPage = i % (cols * rowsPerPage);
        
        if (i > 0 && indexOnPage === 0) {
            doc.addPage();
        }

        const col = indexOnPage % cols;
        const row = Math.floor(indexOnPage / cols);

        const x = marginX + col * (labelWidth + gapX);
        const y = marginY + row * (labelHeight + gapY);

        // Draw label boundary
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(x, y, labelWidth, labelHeight);

        // Add QR Code
        const qrDataUrl = await QRCode.toDataURL(wot.lot_number, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 150
        });

        const qrSize = 35;
        doc.addImage(qrDataUrl, "PNG", x + 5, y + 7.5, qrSize, qrSize);

        // Add Text
        doc.setTextColor(0, 0, 0);
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(wot.lot_number, x + 45, y + 15);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Project: ${wot.project_name || 'N/A'}`, x + 45, y + 25);
        doc.text(`Qty: ${wot.qty} PCS`, x + 45, y + 32);
        
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, x + 45, y + 42);
    }

    // Save PDF
    doc.save("WOT_Labels_Batch.pdf");
}
