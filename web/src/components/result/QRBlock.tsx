import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/Primitives";

/** R-30: QR code of the current permalink (scene, detector, selection, filter and divider), so a phone opens the exact same view. */
export default function QRBlock({ url }: { url: string }) {
  const [qr, setQr] = useState<{ url: string; src: string }>();
  useEffect(() => {
    let alive = true;
    // the permalink changes while the divider is dragged; wait until it settles before drawing
    const t = setTimeout(() => {
      QRCode.toDataURL(url, { margin: 1, width: 160 }).then((src) => alive && setQr({ url, src })).catch(() => alive && setQr({ url, src: "" }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [url]);
  return (
    <div className="mt-s12 flex items-center gap-s12 text-tiny text-secondary">
      {qr?.src ? (
        <img src={qr.src} alt="QR code to open this view on a phone" width={88} height={88} data-testid="qr"
          className="fade-200 h-22 w-22 shrink-0 rounded-sm bg-white p-1" />
      ) : !qr && <Skeleton width={88} height={88} />}
      <span>{qr && !qr.src ? "The QR code could not be drawn; copy the page address instead." : "Scan to open this exact view on a phone (permalink)."}</span>
    </div>
  );
}
