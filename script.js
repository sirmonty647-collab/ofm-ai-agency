/* ============================================
   STELLA LANDING PAGE — Conversion Optimised
   ============================================ */

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
        timestamp: new Date().toISOString(),
        pageUrl: window.location.href,
        referrer: document.referrer || 'direct',
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
        events: []
    },

    init() {
        this.trackEvent('page_view', {});
        this.startScrollTracking();
        this.startTimeTracking();
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
                isp: data.org
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
        "models/stella/gallery/image (2).webp",
        "models/stella/gallery/image2.webp",
        "models/stella/gallery/Screenshot 2026-07-11 at 3.24.47 pm.png",
        "models/stella/gallery/hf_20260711_021149_7f80980a-6e3d-4a1b-92c0-9f1b88859af4.png",
        "models/stella/gallery/hf_20260711_030605_cda8acbb-87ae-4314-be79-8df9dcd9e261.png"
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

        // Intersection Observer for lazy load animation
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

    // Lightbox controls
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
// IP-BASED LOCATION + URGENCY
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
    
    // Update location badge silently
    if (isRestricted) {
        locationText.textContent = `⚠️ Limited availability in ${country}`;
        badge.style.color = '#ffd600';
    } else {
        const locationStr = city ? `${city}, ${country}` : country;
        locationText.textContent = `📍 ${locationStr}`;
    }
    
    // Show badge with fade
    badge.classList.add('visible');
    
    // Personalise tagline
    const tagline = document.getElementById('hero-tagline');
    if (tagline && !isRestricted && city) {
        const greetings = [
            `Looking for a boyfriend / Content partner to make sextapes with me 😈`,
            `Need a boyfriend / Content partner from ${city}... any takers? 💋`,
            `Searching for someone in ${city} to star in my next video 🔥`,
            `Someone from ${city} come help me make content 💕`
        ];
        tagline.textContent = greetings[Math.floor(Math.random() * greetings.length)];
    }
}

// ============================================
// URGENCY — Fake viewer count
// ============================================
function initUrgency() {
    const viewerEl = document.getElementById('viewer-count');
    if (!viewerEl) return;

    // Random starting count between 87-157
    let count = Math.floor(Math.random() * 70) + 87;
    viewerEl.textContent = count;

    // Increment randomly every 4-10 seconds
    setInterval(() => {
        count += Math.floor(Math.random() * 3) + 1;
        viewerEl.textContent = count;
    }, Math.floor(Math.random() * 6000) + 4000);
}

// ============================================
// SCROLL HINT — Click to scroll to gallery
// ============================================
function initScrollHint() {
    const hint = document.querySelector('.scroll-hint');
    if (!hint) return;

    hint.addEventListener('click', () => {
        document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' });
    });
}

// ============================================
// EXPOSE TRACKING GLOBALLY
// ============================================
function trackFanvueClick() {
    Tracker.trackFanvueClick();
    // The href on the <a> tag handles the navigation
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    Tracker.init();
    initAgeVerification();
    initGallery();
    initLocationBadge();
    initUrgency();
    initScrollHint();

    console.log('🔥 Stella Landing Page loaded');
    console.log('📊 Tracking active - Session:', Tracker.data.sessionId);
});
