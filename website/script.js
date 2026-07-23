/* ============================================
   STELLA LANDING PAGE — Conversion Optimised
   ============================================ */

// ============================================
// SUPABASE CONFIG
// ============================================
const SUPABASE_URL = 'https://wmiydawnybullqwnuqvq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9qzgTB6orAb-MSJO8s5qAg_2XLRxTOL';

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    SESSION_KEY: 'stella_session',
    AGE_VERIFIED_KEY: 'stella_age_verified',
    FANVUE_URL: 'https://www.fanvue.com/stellalina'
};

// ============================================
// SESSION MANAGEMENT
// ============================================
function getSessionId() {
    let session = localStorage.getItem(CONFIG.SESSION_KEY);
    if (!session) {
        session = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(CONFIG.SESSION_KEY, session);
    }
    return session;
}

// ============================================
// TRACKING ENGINE
// ============================================
const Tracker = {
    data: {
        sessionId: getSessionId(),
        model: 'stella',
        timestamp: new Date().toISOString(),
        pageUrl: window.location.href,
        referrer: document.referrer || 'direct',
        utmSource: getUtmSource(),
        userAgent: navigator.userAgent,
        deviceType: getDeviceType(),
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scrollDepth: 0,
        timeOnPage: 0,
        ctaClicks: 0,
        galleryViews: 0,
        fanvueClicked: false,
        location: {},
        events: []
    },

    init() {
        this.trackEvent('page_view', {});
        this.startScrollTracking();
        this.startTimeTracking();
        this.startHeartbeat();
        this.trackExit();
        this.getLocation();
    },

    trackEvent(eventType, metadata = {}) {
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...metadata
        };
        this.data.events.push(event);
        this.save();
    },

    startScrollTracking() {
        let maxScroll = 0;
        window.addEventListener('scroll', () => {
            const scrollPercent = Math.round(
                (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100
            );
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                this.data.scrollDepth = maxScroll;
                if (maxScroll === 25) this.trackEvent('scroll_25', {});
                if (maxScroll === 50) this.trackEvent('scroll_50', {});
                if (maxScroll === 75) this.trackEvent('scroll_75', {});
                if (maxScroll === 100) this.trackEvent('scroll_100', {});
            }
        }, { passive: true });
    },

    startTimeTracking() {
        const start = Date.now();
        setInterval(() => {
            this.data.timeOnPage = Math.round((Date.now() - start) / 1000);
        }, 1000);
    },

    trackExit() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.trackEvent('page_exit', { timeOnPage: this.data.timeOnPage });
                this.save();
                this.pushToSupabase();
            }
        });
    },

    async getLocation() {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            this.data.location = {
                ip: data.ip,
                city: data.city,
                region: data.region,
                country: data.country_name,
                countryCode: data.country_code,
                isp: data.ip  // Store IP in isp field for dedup in dashboard
            };
            this.trackEvent('location_detected', this.data.location);
            this.save();
        } catch (e) {
            console.log('Location tracking unavailable');
        }
    },

    trackFanvueClick() {
        this.data.ctaClicks++;
        this.data.fanvueClicked = true;
        this.trackEvent('fanvue_click', {
            clickCount: this.data.ctaClicks,
            scrollDepth: this.data.scrollDepth,
            timeOnPage: this.data.timeOnPage
        });
        this.save();
        // Immediately push to Supabase before navigation happens
        this.pushToSupabase();
    },

    trackGalleryView() {
        this.data.galleryViews++;
        this.trackEvent('gallery_view', { total: this.data.galleryViews });
        this.save();
    },

    save() {
        try {
            localStorage.setItem('tracking_data', JSON.stringify(this.data));
        } catch (e) {
            console.log('Tracking save error:', e);
        }
    },

    startHeartbeat() {
        // Send first heartbeat immediately (1 second) so dashboard shows live count fast
        // Then every 30 seconds after that
        setTimeout(() => {
            this.trackEvent('heartbeat', { timeOnPage: this.data.timeOnPage });
            this.pushHeartbeat();
        }, 1000);

        setInterval(() => {
            this.trackEvent('heartbeat', { timeOnPage: this.data.timeOnPage });
            this.pushHeartbeat();
        }, 30000);
    },

    async pushHeartbeat() {
        try {
            // Upsert: update the visit row with latest time_on_page + add heartbeat event
            // We use PATCH to update the existing session's events array
            const payload = {
                time_on_page: this.data.timeOnPage,
                scroll_depth: this.data.scrollDepth,
                events: this.data.events
            };

            await fetch(`${SUPABASE_URL}/rest/v1/visits?session_id=eq.${encodeURIComponent(this.data.sessionId)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // Silent fail — heartbeat isn't critical
        }
    },

    async pushToSupabase() {
        try {
            const payload = {
                session_id: this.data.sessionId,
                model: this.data.model,
                timestamp: this.data.timestamp,
                page_url: this.data.pageUrl,
                referrer: this.data.referrer,
                utm_source: this.data.utmSource,
                device_type: this.data.deviceType,
                screen_size: this.data.screenSize,
                language: this.data.language,
                timezone: this.data.timezone,
                scroll_depth: this.data.scrollDepth,
                time_on_page: this.data.timeOnPage,
                cta_clicks: this.data.ctaClicks,
                fanvue_clicked: this.data.fanvueClicked,
                location_city: this.data.location?.city || null,
                location_country: this.data.location?.country || null,
                location_country_code: this.data.location?.countryCode || null,
                location_isp: this.data.location?.isp || null,
                events: this.data.events
            };

            await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.log('Supabase push error:', e);
        }
    },

    getData() {
        return this.data;
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return 'mobile';
    return 'desktop';
}

function getUtmSource() {
    const params = new URLSearchParams(window.location.search);
    return params.get('utm_source') || params.get('source') || params.get('ref') || null;
}

// ============================================
// AGE VERIFICATION
// ============================================
function initAgeVerification() {
    const overlay = document.getElementById('age-overlay');
    const yesBtn = document.getElementById('age-yes');
    const noBtn = document.getElementById('age-no');

    if (localStorage.getItem(CONFIG.AGE_VERIFIED_KEY) === 'true') {
        overlay.classList.add('hidden');
        return;
    }

    yesBtn.addEventListener('click', () => {
        localStorage.setItem(CONFIG.AGE_VERIFIED_KEY, 'true');
        overlay.classList.add('hidden');
        Tracker.trackEvent('age_verified', {});
    });

    noBtn.addEventListener('click', () => {
        Tracker.trackEvent('age_rejected', {});
        window.location.href = 'https://google.com';
    });
}

// ============================================
// GALLERY
// ============================================
function initGallery() {
    const grid = document.getElementById('gallery-grid');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.querySelector('.lightbox-close');

    const galleryImages = [
        "models/stella/gallery/image (1).webp",
        "models/stella/gallery/image2.webp",
        "models/stella/gallery/photoshoot1.webp",
        "models/stella/gallery/selfie1.webp"
    ];

    galleryImages.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.loading = 'lazy';
        img.alt = 'Stella';
        
        img.addEventListener('click', () => {
            lightboxImg.src = src;
            lightbox.classList.add('active');
            Tracker.trackGalleryView();
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        img.style.opacity = '0';
        img.style.transform = 'translateY(20px)';
        img.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(img);

        grid.appendChild(img);
    });

    lightboxClose.addEventListener('click', () => {
        lightbox.classList.remove('active');
    });

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            lightbox.classList.remove('active');
        }
    });
}

// ============================================
// IP-BASED LOCATION
// ============================================
let visitorLocation = { city: '', country: '', countryCode: '' };

async function initLocationBadge() {
    const locationText = document.getElementById('location-text');
    const badge = document.getElementById('location-badge');
    if (!locationText || !badge) return;

    const apis = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json/?fields=city,country,countryCode',
        'https://ipwho.is/'
    ];
    
    let data = null;
    
    for (const api of apis) {
        try {
            const res = await fetch(api, { mode: 'cors' });
            if (!res.ok) continue;
            const json = await res.json();
            
            if (api.includes('ipapi.co')) {
                data = { city: json.city, country: json.country_name, countryCode: json.country_code };
            } else if (api.includes('ip-api.com')) {
                data = { city: json.city, country: json.country, countryCode: json.countryCode };
            } else if (api.includes('ipwho.is')) {
                data = { city: json.city, country: json.country, countryCode: json.country_code };
            }
            
            if (data && data.country) break;
        } catch (e) {
            continue;
        }
    }
    
    if (!data) {
        data = { city: '', country: 'your area', countryCode: '' };
    }

    visitorLocation = {
        city: data.city || '',
        country: data.country || '',
        countryCode: data.countryCode || ''
    };
    
    const { city, country, countryCode } = visitorLocation;
    const restrictedCountries = ['CN', 'RU', 'IR', 'KP', 'SY', 'CU'];
    const isRestricted = restrictedCountries.includes(countryCode);
    
    if (isRestricted) {
        locationText.textContent = `⚠️ Limited availability in ${country}`;
        badge.style.color = '#ffd600';
    } else {
        const locationStr = city ? `${city}, ${country}` : country;
        locationText.textContent = `📍 ${locationStr}`;
    }
    
    badge.classList.add('visible');
    
    const tagline = document.getElementById('hero-tagline');
    if (tagline && !isRestricted && city) {
        tagline.textContent = `${city} girl ready to keep you company tonight 💦 Get my Free Solo Video when you subscribe`;
    } else if (tagline) {
        tagline.textContent = `Girl ready to keep you company tonight 💦 Get my Free Solo Video when you subscribe`;
    }


}

// ============================================
// SCROLL HINT
// ============================================
function initScrollHint() {
    const hint = document.querySelector('.scroll-hint');
    if (!hint) return;

    hint.addEventListener('click', () => {
        document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' });
    });
}

// ============================================
// CTA CLICK HANDLER — Track THEN navigate
// ============================================
function initCTAButtons() {
    const heroBtn = document.getElementById('cta-btn-hero');
    const galleryBtn = document.getElementById('cta-btn-gallery');

    [heroBtn, galleryBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', function(e) {
            e.preventDefault(); // Stop immediate navigation
            const url = this.href;

            // Track the click
            Tracker.trackFanvueClick();

            // Small delay to let Supabase request fire, then navigate
            setTimeout(() => {
                window.open(url, '_blank');
            }, 300);
        });
    });
}

// ============================================
// SHOOTING STARS — subtle blue particles
// ============================================
function initShootingStars() {
    const canvas = document.getElementById('stars-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let stars = [];
    let scrollSpeed = 0;
    let lastScrollY = window.scrollY;
    let scrollVelocity = 0;
    const STAR_COUNT = 60;

    function resize() {
        const hero = canvas.parentElement;
        canvas.width = hero.offsetWidth;
        canvas.height = hero.offsetHeight;
    }

    class Star {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 1.8 + 0.4;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = Math.random() * 0.4 + 0.1;
            this.opacity = Math.random() * 0.5 + 0.15;
            this.trail = [];
            this.trailLength = Math.floor(Math.random() * 4) + 2;
            this.hue = 210 + Math.random() * 30; // blue range
        }

        update(speedMultiplier) {
            const spd = speedMultiplier || 1;
            this.x += this.speedX * spd;
            this.y += this.speedY * spd;

            // Store trail
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailLength) {
                this.trail.shift();
            }

            // Reset if off screen
            if (this.y > canvas.height + 10 || this.x < -10 || this.x > canvas.width + 10) {
                this.reset();
                this.y = -5;
                this.x = Math.random() * canvas.width;
            }
        }

        draw(ctx) {
            // Draw trail
            for (let i = 0; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * this.opacity * 0.4;
                ctx.beginPath();
                ctx.arc(this.trail[i].x, this.trail[i].y, this.size * (i / this.trail.length) * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${this.hue}, 80%, 70%, ${alpha})`;
                ctx.fill();
            }

            // Draw star
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${this.hue}, 80%, 80%, ${this.opacity})`;
            ctx.fill();

            // Soft glow
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${this.hue}, 70%, 70%, ${this.opacity * 0.12})`;
            ctx.fill();
        }
    }

    function init() {
        resize();
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push(new Star());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Smooth scroll velocity
        const currentScrollY = window.scrollY;
        scrollVelocity += (Math.abs(currentScrollY - lastScrollY) - scrollVelocity) * 0.1;
        scrollVelocity = Math.max(0, scrollVelocity);
        lastScrollY = currentScrollY;

        // Map scroll velocity to speed multiplier (1 = slow, 4 = fast)
        const speedMultiplier = 1 + Math.min(scrollVelocity / 50, 3);

        stars.forEach(star => {
            star.update(speedMultiplier);
            star.draw(ctx);
        });

        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    init();
    animate();
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    Tracker.init();
    initAgeVerification();
    initGallery();
    initLocationBadge();
    initScrollHint();
    initCTAButtons();
    initShootingStars();



    // Push to Supabase after 3 seconds (initial page view data)
    setTimeout(() => Tracker.pushToSupabase(), 3000);

    console.log('🔥 Stella Landing Page loaded');
    console.log('📊 Tracking active - Session:', Tracker.data.sessionId);
});

