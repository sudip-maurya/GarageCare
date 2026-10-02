import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api, { getFullImageUrl } from '../utils/api';
import { useSmartBack } from '../utils/navigation';
import { Printer, MessageCircle, ArrowLeft, CreditCard, QrCode, Bell, X, Maximize2 } from 'lucide-react';
import { getWhatsAppUrl, getPaymentReminderWhatsAppUrl } from '../utils/whatsapp';
import PaymentModal from '../components/PaymentModal';
import PaymentQrModal from '../components/PaymentQrModal';
import './invoice.css';

const SHOP_LOGO = '/images/garage-logo.webp';

const ViewBill = () => {
  const { id } = useParams();
  const handleBack = useSmartBack('/bills');
  const [bill, setBill] = useState(null);
  const [payments, setPayments] = useState([]);
  const [qrSettings, setQrSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [whatsAppOpening, setWhatsAppOpening] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEnlargeQrModal, setShowEnlargeQrModal] = useState(false);

  // Close enlarge QR modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showEnlargeQrModal) {
        setShowEnlargeQrModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEnlargeQrModal]);

  const fetchBillData = useCallback(async () => {
    try {
      const [billRes, paymentsRes, qrRes] = await Promise.all([
        api.get(`/bills/${id}`),
        api.get(`/payments/bill/${id}`).catch(() => ({ data: { payments: [] } })),
        api.get('/payments/qr').catch(() => ({ data: null }))
      ]);
      setBill(billRes.data);
      setPayments(paymentsRes.data?.payments || []);
      setQrSettings(qrRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bill details', error);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBillData();
  }, [fetchBillData]);

  // Print with a temporary document title so the saved PDF gets a useful filename
  const handlePrint = () => {
    if (!bill) return;
    const sanitize = (s) => String(s || '').replace(/[^\w-]+/g, '_');
    const vehicle = bill.vehicleDetails?.vehicleNumber || bill.vehicle?.vehicleNumber || '';
    const billNo = bill.billNumber || '';
    const originalTitle = document.title;
    document.title = `${sanitize(vehicle)}_Invoice_${sanitize(billNo)}`;
    window.print();
    window.setTimeout(() => {
      document.title = originalTitle;
    }, 2000);
  };

  const handleWhatsApp = () => {
    if (!bill || whatsAppOpening) return;

    setWhatsAppOpening(true);
    setFeedback({ type: '', message: '' });
    const currentGarageName = bill.garageDetails?.name || 'My Garage';
    const { url, error } = getWhatsAppUrl(bill, currentGarageName);

    if (error) {
      setFeedback({ type: 'danger', message: error });
      setWhatsAppOpening(false);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setFeedback({
      type: 'info',
      message: 'WhatsApp opened with the bill message. Print / Save PDF, then attach that file manually in WhatsApp.'
    });
    window.setTimeout(() => setWhatsAppOpening(false), 500);
  };

  const handleWhatsAppReminder = () => {
    if (!bill) return;
    setFeedback({ type: '', message: '' });
    const { url, error } = getPaymentReminderWhatsAppUrl(bill);

    if (error) {
      setFeedback({ type: 'danger', message: error });
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setFeedback({
      type: 'info',
      message: 'WhatsApp opened with the payment reminder message.'
    });
  };

  const handlePaymentUpdated = () => {
    fetchBillData();
  };

  if (loading) return <div className="text-center p-5">Loading Bill...</div>;
  if (!bill) return <div className="text-center p-5 text-danger">Bill not found</div>;

  const totalAmount = Number(bill.totalAmount) || 0;
  const totalPaid = Number(bill.totalPaid !== undefined ? bill.totalPaid : bill.paidAmount) || 0;
  const outstanding = Number(bill.outstanding !== undefined ? bill.outstanding : Math.max(totalAmount - totalPaid, 0));
  const isFullyPaid = outstanding <= 0 && totalAmount > 0;
  const vehicleNameValue = [bill.vehicle?.brand, bill.vehicle?.model]
    .filter((v) => v && String(v).trim())
    .join(' ');
  const displayStatus = isFullyPaid
    ? 'PAID IN FULL'
    : (bill.paymentStatus === 'Partially Paid' || (totalPaid > 0 && outstanding > 0)
        ? 'Partially Paid'
        : (bill.paymentStatus || bill.status || 'Pending'));
  const garageName = bill.garageDetails?.name || 'My Garage';
  const garageAddress = 'Shop No. 1, Arch Gold Building, SV Road, Kandivli West, Opp Honda Showroom, Mumbai 400067';

  const garageContact = '9619966132';
  const customerName = bill.customer?.name || bill.customerDetails?.name || '';
  const customerMobile = bill.customer?.mobile || bill.customerDetails?.mobile || '';
  const vehicleNumber = bill.vehicleDetails?.vehicleNumber || bill.vehicle?.vehicleNumber || '';
  const discountAmount = Number(bill.discount) || 0;
  const subtotal = totalAmount + discountAmount;
  const itemsTotal = (bill.items && bill.items.length > 0)
    ? bill.items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || Number(item.amount) || 0;
        const totalPrice = Number(item.totalPrice) || Number(item.amount) || (qty * unitPrice);
        return sum + totalPrice;
      }, 0)
    : 0;
  const paymentAccount = {
    ...(qrSettings || {}),
    ...(bill.paymentAccount || {}),
    ...(bill.paymentAccountDetails || {}),
    qrCodeUrl: bill.paymentAccount?.qrCodeUrl || bill.paymentAccountDetails?.qrCodeUrl || qrSettings?.qrCodeUrl || ''
  };
  const hasPaymentAccount = !!(paymentAccount && (paymentAccount.qrCodeUrl || paymentAccount.upiId || paymentAccount.bankDetails));
  // Drives the print-only dedicated A4 QR payment page (page 2 of the PDF).
  const hasPaymentQr = hasPaymentAccount;
  const hasPaymentHistory = payments && payments.length > 0;
  const statusTone = isFullyPaid ? 'paid' : displayStatus === 'Partially Paid' ? 'partial' : 'pending';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Non-printable Action Bar */}
      <div className="vb-toolbar-wrapper d-print-none">
        <div className="vb-toolbar">
          <button type="button" onClick={handleBack} className="vb-btn vb-btn-back">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="vb-toolbar-group">
            <button
              type="button"
              className="vb-btn vb-btn-primary"
              onClick={() => setShowPaymentModal(true)}
            >
              <CreditCard size={16} />
              <span>Manage Payment</span>
            </button>
            <button
              type="button"
              className="vb-btn vb-btn-secondary"
              onClick={() => setShowQrModal(true)}
            >
              <QrCode size={16} />
              <span>Show QR</span>
            </button>
            {outstanding > 0 && (
              <button
                type="button"
                className="vb-btn vb-btn-reminder"
                onClick={handleWhatsAppReminder}
              >
                <Bell size={16} />
                <span>Payment Reminder</span>
              </button>
            )}
            <button
              type="button"
              className="vb-btn vb-btn-whatsapp"
              onClick={handleWhatsApp}
              disabled={whatsAppOpening}
            >
              <MessageCircle size={16} />
              <span>{whatsAppOpening ? 'Opening...' : 'Send on WhatsApp'}</span>
            </button>
            <button
              type="button"
              className="vb-btn vb-btn-blue"
              onClick={handlePrint}
            >
              <Printer size={16} />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      </div>

      {feedback.message && (
        <div className={`alert alert-${feedback.type} d-print-none alert-dismissible fade show vb-feedback`} role="alert">
          {feedback.message}
          <button type="button" className="btn-close" onClick={() => setFeedback({ type: '', message: '' })}></button>
        </div>
      )}

      <div className="inv-sheet" id="printable-bill">
        {/* ---------- Header: logo + shop name | INVOICE + bill meta ---------- */}
        <header className="inv-header">
          <div className="inv-brand">
            <img src={SHOP_LOGO} alt={`${garageName} logo`} className="inv-logo" />
            <div className="inv-brand-text">
              <h1 className="inv-shop-name">{garageName}</h1>
              {garageAddress && (
                <div className="inv-shop-line">
                  Shop No. 1, Arch Gold Building, SV Road, Kandivli West,
                  <br />
                  Opp Honda Showroom, Mumbai 400067
                </div>
              )}
              {garageContact && <div className="inv-shop-line">Phone: {garageContact}</div>}
            </div>
          </div>

          <div className="inv-meta">
            <h2 className="inv-meta-title">Invoice</h2>
            <div className="inv-meta-row">
              <span className="inv-meta-label">Bill No.</span>
              <span className="inv-meta-value">{bill.billNumber}</span>
            </div>
            <div className="inv-meta-row">
              <span className="inv-meta-label">Date</span>
              <span className="inv-meta-value">{new Date(bill.date).toLocaleDateString()}</span>
            </div>
            <div className="inv-meta-row">
              <span className="inv-meta-label">Status</span>
              <span className={`inv-status inv-status-${statusTone}`}>{displayStatus}</span>
            </div>
          </div>
        </header>

        <div className="inv-divider" />

        {/* ---------- Billed To / Vehicle Details (two equal rounded cards) ---------- */}
        <div className="inv-parties">
          <div className="inv-party-card">
            <h3 className="inv-party-label">Billed To</h3>
            <div className="inv-party-name">{customerName || '—'}</div>
            {customerMobile && (
              <div className="inv-party-row">
                <span className="inv-k">Phone:</span> <span>{customerMobile}</span>
              </div>
            )}
          </div>

          <div className="inv-party-card">
            <h3 className="inv-party-label">Vehicle Details</h3>
            <span className="inv-plate">{vehicleNumber || '—'}</span>
            {vehicleNameValue && (
              <div className="inv-party-row">
                <span className="inv-k">Model:</span> <span>{vehicleNameValue}</span>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Work performed note ---------- */}
        {bill.service?.workPerformed && (
          <div className="inv-note-card">
            <span className="inv-note-label">Work Performed</span>
            <div className="inv-note-text">{bill.service.workPerformed}</div>
          </div>
        )}

        {/* ---------- Items / services (dynamic rows from this bill) ---------- */}
        <div className="inv-table-wrap">
          <h3 className="inv-section-title">Items &amp; Services</h3>
          {bill.items && bill.items.length > 0 ? (
            <table className="inv-table">
              <thead>
                <tr>
                  <th className="inv-col-num">#</th>
                  <th>Item / Service</th>
                  <th className="inv-col-type">Type</th>
                  <th className="inv-col-amount">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, index) => {
                  const qty = Number(item.quantity) || 1;
                  const unitPrice = Number(item.unitPrice) || Number(item.amount) || 0;
                  const totalPrice = Number(item.totalPrice) || Number(item.amount) || (qty * unitPrice);
                  const itemName = item.description || '—';
                  const itemDesc = item.itemDescription || '';
                  return (
                    <tr key={index}>
                      <td className="inv-col-num">{index + 1}</td>
                      <td>
                        <span className="inv-item-name">{itemName}</span>
                        {itemDesc && itemDesc !== itemName ? (
                          <span className="inv-item-note">{itemDesc}</span>
                        ) : null}
                      </td>
                      <td className="inv-col-type">
                        <span className="inv-type-pill">{item.type || '—'}</span>
                      </td>
                      <td className="inv-col-amount">₹{totalPrice.toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr className="inv-total-row">
                  <td colSpan={3} className="inv-total-label" style={{ textAlign: 'right' }}>
                    TOTAL AMOUNT
                  </td>
                  <td className="inv-col-amount inv-total-amount">
                    ₹{itemsTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="inv-empty">No detailed service items recorded for this bill.</div>
          )}
        </div>

        {/* ---------- Lower section: payments (left) + summary (right) ---------- */}
        <div className={`inv-lower${hasPaymentHistory || hasPaymentAccount ? '' : ' inv-lower-single'}`}>
          <div className="inv-col">
            {/* Payment history for this bill */}
            {hasPaymentHistory && (
              <section className="inv-card">
                <h3 className="inv-card-title">Payment Transactions</h3>
                <table className="inv-table inv-table-compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className="inv-col-amount">Amount Paid (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p._id}>
                        <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                        <td>{p.paymentMethod}</td>
                        <td>{p.referenceNumber || '—'}</td>
                        <td className="inv-col-amount inv-amount-paid">₹{Number(p.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* UPI / bank payment account shown on this bill */}
            {hasPaymentAccount && (
              <section className="inv-card inv-pay-card">
                <h3 className="inv-card-title">
                  UPI Payment{paymentAccount.name ? ` — ${paymentAccount.name}` : ''}
                </h3>
                <div className="inv-pay-body">
                  <div className="inv-qr-box">
                    {paymentAccount.qrCodeUrl ? (
                      <>
                        <button
                          type="button"
                          className="inv-qr-btn position-relative"
                          onClick={() => setShowEnlargeQrModal(true)}
                          title={`Click to enlarge ${paymentAccount.name || 'UPI'} QR code`}
                          aria-label={`Enlarge ${paymentAccount.name || 'UPI'} QR code`}
                        >
                          <img
                            src={getFullImageUrl(paymentAccount.qrCodeUrl)}
                            alt="Payment QR"
                            className="inv-qr"
                            style={{ width: '88px', height: '88px', objectFit: 'contain' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextElementSibling) {
                                e.currentTarget.nextElementSibling.style.display = 'flex';
                              }
                            }}
                          />
                          <div
                            className="border border-dashed rounded p-1 text-muted text-center flex-column align-items-center justify-content-center"
                            style={{ width: '88px', height: '88px', display: 'none', fontSize: '10px' }}
                          >
                            <QrCode size={18} className="mb-1 text-secondary" />
                            <span>QR not uploaded</span>
                          </div>
                          <span
                            className="position-absolute bottom-0 end-0 bg-dark text-white rounded-circle p-1 d-flex align-items-center justify-content-center m-1 shadow-sm opacity-75 d-print-none"
                            style={{ width: '18px', height: '18px' }}
                          >
                            <Maximize2 size={10} />
                          </span>
                        </button>
                        <div className="d-print-none mt-1">
                          <button
                            type="button"
                            className="btn btn-link p-0 text-decoration-none text-muted"
                            style={{ fontSize: '10px' }}
                            onClick={() => setShowEnlargeQrModal(true)}
                          >
                            🔍 Click to enlarge
                          </button>
                        </div>
                      </>
                    ) : (
                      <div
                        className="border border-dashed rounded p-1 text-muted text-center d-flex flex-column align-items-center justify-content-center"
                        style={{ width: '88px', height: '88px', fontSize: '10px' }}
                      >
                        <QrCode size={18} className="mb-1 text-secondary" />
                        <span>QR not uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="inv-pay-info">
                    {paymentAccount.upiId && (
                      <div className="inv-pay-row">
                        <span className="inv-k">UPI:</span> <strong>{paymentAccount.upiId}</strong>
                      </div>
                    )}
                    {paymentAccount.paymentType === 'Bank Transfer' && paymentAccount.bankDetails && (
                      <div className="inv-pay-row">
                        {paymentAccount.bankDetails.bankName && (
                          <div><span className="inv-k">Bank:</span> {paymentAccount.bankDetails.bankName}</div>
                        )}
                        {paymentAccount.bankDetails.accountNumber && (
                          <div><span className="inv-k">A/C:</span> {paymentAccount.bankDetails.accountNumber}</div>
                        )}
                        {paymentAccount.bankDetails.ifscCode && (
                          <div><span className="inv-k">IFSC:</span> {paymentAccount.bankDetails.ifscCode}</div>
                        )}
                      </div>
                    )}
                    {paymentAccount.instructions && (
                      <div className="inv-pay-note">{paymentAccount.instructions}</div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>

          <div className="inv-col">
            <section className="inv-card inv-summary">
              <h3 className="inv-card-title">Payment Summary</h3>

              <div className="inv-sum-row">
                <span>Subtotal</span>
                <span className="inv-sum-value">₹{subtotal.toFixed(2)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="inv-sum-row inv-sum-discount">
                  <span>Discount</span>
                  <span className="inv-sum-value">- ₹{discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="inv-sum-row inv-sum-total">
                <span>Bill Total</span>
                <span className="inv-sum-value">₹{totalAmount.toFixed(2)}</span>
              </div>

              <div className="inv-sum-row inv-sum-paid">
                <span>{isFullyPaid ? 'Bill Amount Paid Fully' : 'Amount Paid'}</span>
                <span className="inv-sum-value">₹{totalPaid.toFixed(2)}</span>
              </div>

              <div className={`inv-sum-row inv-sum-outstanding${isFullyPaid ? ' is-cleared' : ''}`}>
                <span>{isFullyPaid ? 'Outstanding Amount' : 'Outstanding / Balance Due'}</span>
                <span className="inv-sum-value">₹{outstanding.toFixed(2)}</span>
              </div>

              <div className="inv-sum-status">
                <span>Payment Status</span>
                <span className={`inv-status inv-status-${statusTone}`}>{displayStatus}</span>
              </div>
            </section>
          </div>
        </div>

        {/* ---------- Footer ---------- */}
        <div className="inv-footer">
          <small>
            Thank you for choosing <strong>{garageName}</strong>!
          </small>
        </div>
      </div>

      {/* ============================================================
          Dedicated QR payment page — PDF/PAGE 2 ONLY.
          Hidden on screen (invoice.css sets .inv-qr-page { display:none }).
          When printing / saving PDF it always starts on a NEW A4 page
          after the invoice and shows the EXISTING payment QR (same image
          URL used by the invoice UPI card and the Show-QR modal) at a
          large, sharp, scannable size — no transform scaling, no aspect
          distortion, no new QR generation. */}
      {hasPaymentQr && (
        <div className="inv-qr-page" id="printable-qr-page">
          <div className="inv-qr-page-head">
            <img src={SHOP_LOGO} alt="" className="inv-qr-page-logo" aria-hidden="true" />
            <div className="inv-qr-page-shop">{garageName}</div>
            <h2 className="inv-qr-page-heading">Payment QR</h2>
            <div className="inv-qr-page-sub">Scan to Pay</div>
          </div>
          {paymentAccount.qrCodeUrl ? (
            <img
              src={getFullImageUrl(paymentAccount.qrCodeUrl)}
              alt={`${paymentAccount.name || 'Payment'} QR Code`}
              className="inv-qr-page-img"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextElementSibling) {
                  e.currentTarget.nextElementSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="border border-dashed rounded p-4 text-muted text-center flex-column align-items-center justify-content-center my-3"
            style={{ width: '125mm', height: '125mm', margin: '4mm auto', display: paymentAccount.qrCodeUrl ? 'none' : 'flex' }}
          >
            <QrCode size={48} className="mb-2 text-secondary" />
            <span className="fw-semibold fs-5">QR not uploaded</span>
          </div>
          <div className="inv-qr-page-details">
            {paymentAccount.name && (
              <div className="inv-qr-page-name">{paymentAccount.name}</div>
            )}
            {paymentAccount.upiId && (
              <div className="inv-qr-page-upi">
                <span>UPI:</span>
                <strong>{paymentAccount.upiId}</strong>
              </div>
            )}
            <div className="inv-qr-page-note">Scan this QR to make payment</div>
            <div className="inv-qr-page-bill">
              Bill No. <strong>{bill.billNumber}</strong>
              {outstanding > 0 && (
                <> · Amount Due <strong>₹{outstanding.toFixed(2)}</strong></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print CSS: A4 page setup + app-shell resets so the invoice flows across pages */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          /* Every printed page is a standard A4 sheet. The invoice flows onto as
             many pages as it needs (normally 1-2) and is never scaled or clipped. */
          @page {
            size: A4 portrait;
            margin: 10mm 9mm;
          }

          html, body {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important; /* undo the screen-only overflow-x: clip */
            background: #ffffff !important;
          }

          /* Only a plain block-level flow can be paginated reliably, so no flex,
             fixed-height or scroll container may wrap the invoice. */
          #root {
            display: block !important;
            width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
          }

          /* Hide app chrome (sidebar, topbar, screen-only buttons) */
          .app-sidebar,
          .sidebar-backdrop,
          .app-topbar,
          .d-print-none {
            display: none !important;
          }

          /* Neutralize the viewport-height shell containers */
          .vh-100,
          .d-flex.vh-100.bg-light {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          /* ROOT CAUSE of the squeezed 6-page PDF:
             .app-main-wrapper / .gc-main is styled "width: 0" (saas.css) and only
             gains its width from flex-grow inside the sidebar flex row. Once the
             row above is converted to block flow for pagination, "width: 0" is
             no longer overridden by flex sizing, so the whole invoice laid out
             at near-zero width: text wrapped character-by-character and every
             section stacked vertically. Restore a real A4-compatible width on
             every shell wrapper between #root and the invoice sheet. */
          .app-main-wrapper,
          .gc-main,
          .gc-content,
          .flex-grow-1 {
            display: block !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            flex: none !important;
            overflow: visible !important;
            scrollbar-gutter: auto !important;
          }
          .overflow-auto {
            overflow: visible !important;
            padding: 0 !important; /* the @page margins provide the printable edge */
          }

          /* The invoice itself is a plain, breakable block that fills the A4
             content box (210mm - 2 x 9mm margins = 192mm), keeping the exact
             proportions of the on-screen sheet: no fixed height, no scroll
             container, no overflow clipping - it grows with its content. */
          #printable-bill {
            display: block !important;
            position: static !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 auto !important;
            background: #ffffff !important;
          }
        }
      `}} />


      {/* Payment Management Modal */}
      {showPaymentModal && (
        <PaymentModal
          show={showPaymentModal}
          bill={bill}
          onClose={() => setShowPaymentModal(false)}
          onPaymentUpdated={handlePaymentUpdated}
        />
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <PaymentQrModal
          show={showQrModal}
          bill={bill}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Centered Enlarged QR Lightbox Modal */}
      {showEnlargeQrModal && (() => {
        const acc = bill.paymentAccountDetails || qrSettings;
        if (!acc?.qrCodeUrl) return null;

        return (
          <div 
            className="modal show d-block d-print-none" 
            tabIndex="-1" 
            role="dialog"
            aria-modal="true"
            aria-label={`Enlarged ${acc.name || 'Payment'} QR code`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)', zIndex: 1060 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowEnlargeQrModal(false);
              }
            }}
          >
            <div 
              className="modal-dialog modal-dialog-centered" 
              style={{ maxWidth: '420px', margin: '1.75rem auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content shadow-lg border-0 rounded-4 overflow-hidden">
                <div className="modal-header border-0 pb-0 pt-3 px-3 d-flex justify-content-between align-items-center">
                  <span className="badge bg-light text-muted border small">Payment QR Code</span>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center p-1"
                    onClick={() => setShowEnlargeQrModal(false)}
                    aria-label="Close QR modal"
                    style={{ width: '32px', height: '32px' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="modal-body text-center px-4 pt-2 pb-4">
                  {/* Account Name Header */}
                  <h4 className="fw-bold text-dark mb-1">{acc.name || 'Payment QR'}</h4>
                  {acc.paymentType && (
                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle mb-3">
                      {acc.paymentType}
                    </span>
                  )}

                  {/* Bill Details Summary */}
                  <div className="bg-light p-2 rounded mb-3 text-start small">
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Bill Number:</span>
                      <strong>{bill.billNumber}</strong>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Amount Due:</span>
                      <strong className="text-danger">₹{outstanding.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Sharp, Large QR Container (around 300x300px) */}
                  <div 
                    className="p-3 bg-white rounded-3 border d-inline-block shadow-sm mb-3"
                    style={{ maxWidth: '100%' }}
                  >
                    {acc.qrCodeUrl ? (
                      <img
                        src={getFullImageUrl(acc.qrCodeUrl)}
                        alt={`${acc.name || 'Payment'} QR Code`}
                        className="img-fluid"
                        style={{
                          width: '100%',
                          maxWidth: '300px',
                          maxHeight: '300px',
                          objectFit: 'contain',
                          display: 'block'
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className="border border-dashed rounded p-4 text-muted text-center flex-column align-items-center justify-content-center"
                      style={{ width: '220px', height: '220px', margin: '0 auto', display: acc.qrCodeUrl ? 'none' : 'flex' }}
                    >
                      <QrCode size={40} className="mb-2 text-secondary" />
                      <span className="fw-semibold">QR not uploaded</span>
                    </div>
                  </div>

                  {/* UPI ID */}
                  {acc.upiId && (
                    <div className="bg-light p-2 rounded-3 border d-inline-block mb-2 px-3">
                      <span className="text-muted small me-1">UPI:</span>
                      <span className="font-monospace fw-bold fs-6 text-dark">{acc.upiId}</span>
                    </div>
                  )}

                  {/* Instructions */}
                  {acc.instructions && (
                    <div className="text-muted small mt-1 fst-italic px-3">
                      "{acc.instructions}"
                    </div>
                  )}
                </div>

                <div className="modal-footer border-0 pt-0 pb-3 justify-content-center">
                  <button
                    type="button"
                    className="btn btn-secondary px-4 rounded-pill"
                    onClick={() => setShowEnlargeQrModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ViewBill;

