import { useState, useEffect } from 'react';
import api, { getFullImageUrl } from '../utils/api';
import { QrCode, Copy, Check, AlertCircle, Building2 } from 'lucide-react';

const PaymentQrModal = ({ show, onClose, bill = null }) => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/payment-accounts?active=true');
      const list = Array.isArray(data) ? data : [];
      setAccounts(list);
      if (list.length > 0) {
        const def = list.find(a => a.isDefault) || list[0];
        setSelectedAccount(def);
      } else {
        setSelectedAccount(null);
      }
    } catch (err) {
      console.error('Error fetching payment accounts', err);
      // Fallback check legacy qr endpoint
      try {
        const legacy = await api.get('/payments/qr');
        if (legacy.data?.qrCodeUrl || legacy.data?.upiId) {
          setSelectedAccount({
            name: 'Primary Account',
            paymentType: 'UPI',
            upiId: legacy.data.upiId,
            qrCodeUrl: legacy.data.qrCodeUrl,
            instructions: legacy.data.paymentInstructions
          });
        }
      } catch (_e) {
        setError('Unable to load payment accounts.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      if (bill?.paymentAccountDetails?.name || bill?.paymentAccountDetails?.qrCodeUrl || bill?.paymentAccountDetails?.upiId) {
        // Bill has its own saved snapshot
        setSelectedAccount(bill.paymentAccountDetails);
        setLoading(false);
      } else {
        // Fetch active payment accounts
        fetchAccounts();
      }
    }
  }, [show, bill]);

  const handleCopyUpi = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!show) return null;

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow">
          <div className="modal-header">
            <h5 className="modal-title d-flex align-items-center gap-2">
              <QrCode size={20} className="text-primary" /> Payment QR Code
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
          </div>
          <div className="modal-body text-center p-4">
            {loading ? (
              <div className="py-4">Loading payment details...</div>
            ) : error ? (
              <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
                <AlertCircle size={18} /> {error}
              </div>
            ) : (
              <>
                {bill && (
                  <div className="bg-light p-3 rounded mb-3 text-start">
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Bill No:</span>
                      <strong>{bill.billNumber}</strong>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span className="text-muted">Outstanding:</span>
                      <strong className="text-danger">
                        ₹{(bill.outstanding !== undefined ? bill.outstanding : Math.max((bill.totalAmount || 0) - (bill.paidAmount || 0), 0)).toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Account selector when viewed generally without a fixed bill snapshot */}
                {!bill?.paymentAccountDetails?.name && accounts.length > 1 && (
                  <div className="mb-3 text-start">
                    <label className="form-label text-muted small mb-1 fw-semibold">Select Payment Account:</label>
                    <div className="d-flex gap-2 flex-wrap">
                      {accounts.map(acc => (
                        <button
                          key={acc._id}
                          type="button"
                          className={`btn btn-sm ${selectedAccount?._id === acc._id ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setSelectedAccount(acc)}
                        >
                          {acc.name} ({acc.paymentType})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAccount ? (
                  <div>
                    <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
                      <span className="badge bg-primary fs-6">{selectedAccount.name}</span>
                      <span className="badge bg-secondary">{selectedAccount.paymentType}</span>
                    </div>

                    {selectedAccount.qrCodeUrl ? (
                      <div className="mb-3">
                        <img
                          src={getFullImageUrl(selectedAccount.qrCodeUrl)}
                          alt={`${selectedAccount.name} QR Code`}
                          className="img-fluid rounded border p-2 bg-white"
                          style={{ maxHeight: '240px', maxWidth: '240px', objectFit: 'contain' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display = 'block';
                            }
                          }}
                        />
                        <div className="alert alert-light border py-3 text-muted" style={{ display: 'none' }}>
                          QR not uploaded
                        </div>
                      </div>
                    ) : (
                      <div className="alert alert-light border py-3 mb-3 text-muted">
                        QR not uploaded
                      </div>
                    )}

                    {selectedAccount.upiId && (
                      <div className="mb-3">
                        <label className="form-label text-muted small mb-1">UPI ID</label>
                        <div className="input-group justify-content-center">
                          <span className="form-control text-center fw-bold bg-light" style={{ maxWidth: '280px' }}>
                            {selectedAccount.upiId}
                          </span>
                          <button
                            className="btn btn-outline-secondary d-flex align-items-center gap-1"
                            type="button"
                            onClick={() => handleCopyUpi(selectedAccount.upiId)}
                            title="Copy UPI ID"
                          >
                            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bank Details if present */}
                    {selectedAccount.paymentType === 'Bank Transfer' && selectedAccount.bankDetails && (
                      <div className="bg-light p-3 rounded text-start mb-3 small">
                        <div className="fw-bold mb-1 d-flex align-items-center gap-1">
                          <Building2 size={16} className="text-primary" /> Bank Account Details:
                        </div>
                        {selectedAccount.bankDetails.bankName && <div><strong>Bank:</strong> {selectedAccount.bankDetails.bankName}</div>}
                        {selectedAccount.bankDetails.accountNumber && <div><strong>A/C No:</strong> {selectedAccount.bankDetails.accountNumber}</div>}
                        {selectedAccount.bankDetails.ifscCode && <div><strong>IFSC:</strong> {selectedAccount.bankDetails.ifscCode}</div>}
                        {selectedAccount.bankDetails.accountHolderName && <div><strong>Holder:</strong> {selectedAccount.bankDetails.accountHolderName}</div>}
                      </div>
                    )}

                    {selectedAccount.instructions && (
                      <div className="alert alert-info small text-start mb-0">
                        <strong>Payment Instructions:</strong>
                        <p className="mb-0 mt-1">{selectedAccount.instructions}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="alert alert-warning py-3 mb-0">
                    No active payment account configured yet. You can add one in Payments &gt; Payment Accounts Settings.
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentQrModal;
