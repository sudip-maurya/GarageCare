import { Link } from 'react-router-dom';
import { MessageCircle, Phone, Settings as SettingsIcon, User, Building2 } from 'lucide-react';

const settingsPath = '/settings?section=insurance-agent';

const InsuranceAgentPanel = ({ agent, formatWhatsAppNumber }) => {
  if (!agent) {
    return (
      <section className="ins-hero ins-hero--empty" aria-labelledby="ins-agent-empty-title">
        <span className="ins-hero-empty-ic" aria-hidden="true"><SettingsIcon size={22} /></span>
        <div className="ins-hero-empty-body">
          <h5 id="ins-agent-empty-title">Insurance Agent Not Configured</h5>
          <p>Add Insurance Agent details from Garage Profile settings to enable calls, WhatsApp, and renewal coordination.</p>
        </div>
        <Link to={settingsPath} className="btn btn-primary ins-btn-config">
          <SettingsIcon size={16} /> Configure Agent Details
        </Link>
      </section>
    );
  }

  const waHref = agent.whatsapp ? `https://wa.me/${formatWhatsAppNumber(agent.whatsapp)}` : null;

  return (
    <section className="ins-hero" aria-labelledby="ins-hero-title">
      <div className="ins-hero-grid">
        <div className="ins-hero-main">
          <span className="ins-hero-badge">Hassle-Free Protection</span>
          <h2 className="ins-hero-title" id="ins-hero-title">YOUR INSURANCE AGENT IS READY TO HELP</h2>
          <p className="ins-hero-desc">
            Your saved Insurance Agent can coordinate renewal quotes, paperwork, claims, and No-Claim Bonus support for your garage customers.
          </p>
          <div className="ins-hero-actions">
            <a
              href={`tel:${agent.phone}`}
              className="btn ins-btn-call"
              title={`Call Insurance Agent ${agent.name}`}
            >
              <Phone size={16} /> <span>Call Agent</span> <span className="ins-btn-sub">{agent.phone}</span>
            </a>
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="btn ins-btn-wa"
                title={`WhatsApp Insurance Agent ${agent.name}`}
              >
                <MessageCircle size={16} /> <span>WhatsApp Agent</span> <span className="ins-btn-sub">{agent.whatsapp}</span>
              </a>
            ) : (
              <Link to={settingsPath} className="btn ins-btn-wa-ghost" title="Configure WhatsApp number in settings">
                <MessageCircle size={16} /> WhatsApp Not Configured
              </Link>
            )}
          </div>
        </div>

        <aside className="ins-agent-card" aria-label="Assigned insurance agent">
          <div className="ins-agent-card-label"><User size={13} /> Assigned Insurance Agent</div>
          <div className="ins-agent-name">{agent.name}</div>
          <div className="ins-agent-company"><Building2 size={13} /> {agent.companyName || 'Insurance agency not specified'}</div>
          <div className="ins-agent-sep" />
          <div className="ins-agent-row">
            <span className="ins-agent-ic" aria-hidden="true"><Phone size={15} /></span>
            <span className="ins-agent-row-body">
              <span className="ins-agent-k">Direct</span>
              <a className="ins-agent-v" href={`tel:${agent.phone}`}>{agent.phone}</a>
            </span>
          </div>
          <div className="ins-agent-row">
            <span className="ins-agent-ic" aria-hidden="true"><MessageCircle size={15} /></span>
            <span className="ins-agent-row-body">
              <span className="ins-agent-k">WhatsApp</span>
              {waHref ? (
                <a className="ins-agent-v" href={waHref} target="_blank" rel="noreferrer">{agent.whatsapp}</a>
              ) : (
                <span className="ins-agent-v is-muted">Not configured</span>
              )}
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default InsuranceAgentPanel;
