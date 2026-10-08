export interface PdfOptions {
  orientation?: "portrait" | "landscape";
  format?: "a4" | "a5" | [number, number];
}

/**
 * High-DPI Lossless PDF Engine
 * Utilizes html-to-image (PNG format with high pixelRatio) and jsPDF
 * to eliminate JPEG compression artifacts and guarantee crisp text and graphics.
 */
export const generatePDF = async (
  element: HTMLElement,
  filename: string,
  options?: PdfOptions,
): Promise<void> => {
  try {
    // Ensure all web fonts are loaded and ready before capture
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready;
    }

    const { toPng } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");

    const targetWidth = element.offsetWidth || 794;
    const targetHeight = element.offsetHeight || 1123;

    // Deep clone to ensure we don't accidentally affect the UI during capture
    const clone = element.cloneNode(true) as HTMLElement;

    // Attach to body with fixed positioning in viewport for accurate subpixel font layout,
    // while keeping invisible to avoid visual flickering.
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = `${targetWidth}px`;
    container.style.height = `${targetHeight}px`;
    container.style.zIndex = "-99999";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    container.style.overflow = "hidden";
    container.style.backgroundColor = "#ffffff";

    // Enhance font rendering & subpixel anti-aliasing on cloned tree
    clone.style.transform = "none";
    clone.style.width = `${targetWidth}px`;
    clone.style.height = `${targetHeight}px`;
    clone.style.minWidth = `${targetWidth}px`;
    clone.style.maxWidth = `${targetWidth}px`;
    clone.style.minHeight = `${targetHeight}px`;
    clone.style.maxHeight = `${targetHeight}px`;
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
    (clone.style as any).webkitFontSmoothing = "antialiased";
    (clone.style as any).mozOsxFontSmoothing = "grayscale";
    clone.style.textRendering = "optimizeLegibility";

    container.appendChild(clone);
    document.body.appendChild(container);

    // Wait a brief moment for styles, fonts and SVG icons to settle
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Capture using html-to-image to PNG (Lossless) with high pixelRatio
    const dataUrl = await toPng(clone, {
      quality: 1.0,
      pixelRatio: 3.0, // 300+ DPI equivalent crispness
      backgroundColor: "#ffffff",
      width: targetWidth,
      height: targetHeight,
      skipFonts: false,
      style: {
        transform: "none",
        margin: "0",
      },
    });

    // Cleanup container immediately
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }

    // Initialize jsPDF
    const pdf = new jsPDF({
      orientation: options?.orientation || "portrait",
      unit: "mm",
      format: options?.format || "a4",
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Render high-res PNG into PDF page
    pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    pdf.save(filename);
  } catch (error: any) {
    console.error("Print Engine Failure:", error);
    throw new Error(
      `Print generation failed: ${error?.message || String(error)}`,
    );
  }
};

