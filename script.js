/* ============================================
   STELLA LANDING PAGE — Tracking & Interactions
   ============================================ */

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    TRACKING_ENDPOINT: 'tracking/data.json',
    SESSION_KEY: 'stella_session',
    AGE_VERIFIED_KEY: 'stella_age_verified',
    DASHBOARD_PASSWORD: 'stella2026',
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
        utmSource: getUrlParam('utm_source') || 'direct',
        utmMedium: getUrlParam('utm_medium') || 'none',
        utmCampaign: getUrlParam('utm_campaign') || 'none',
        utmContent: getUrlParam('utm_content') || 'none',
        utmTerm: getUrlParam('utm_term') || 'none',
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
            // Save to localStorage as backup
            localStorage.setItem('tracking_data', JSON.stringify(this.data));
            
            // Try to save to server via fetch (POST to a simple endpoint)
            // For static hosting, we'll use localStorage + JSON file download approach
            this.syncToServer();
        } catch (e) {
            console.log('Tracking save error:', e);
        }
    },

    async syncToServer() {
        try {
            // For static sites, we store in localStorage and the admin dashboard reads from there
            // In production, you'd replace this with a proper API endpoint
            const payload = {
                action: 'track',
                data: this.data
            };
            
            // Attempt to send via beacon for reliability
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon('/api/track', blob);
            }
        } catch (e) {
            // Silent fail - tracking should never break the page
        }
    },

    getData() {
        return this.data;
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

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

    // Check if already verified
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

    // Gallery images from config (all correct Stella images)
    const galleryImages = [
        "models/stella/gallery/image (1).webp",
        "models/stella/gallery/image (2).webp",
        "models/stella/gallery/image2.webp",
        "models/stella/gallery/Screenshot 2026-07-11 at 3.24.47 pm.png",
        "models/stella/gallery/hf_20260711_021149_7f80980a-6e3d-4a1b-92c0-9f1b88859af4.png",
        "models/stella/gallery/hf_20260711_030605_cda8acbb-87ae-4314-be79-8df9dcd9e261.png"
    ];

    // Show all images (no shuffle, just show what we have)
    const shuffled = [...galleryImages];


    shuffled.forEach(src => {
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
// NAVIGATION
// ============================================
function initNavigation() {
    const navbar = document.querySelector('.navbar');
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');

    // Scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    // Close menu on link click
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });
}

// ============================================
// SMOOTH SCROLL
// ============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#fanvue') return; // Let the fanvue section handle its own CTA
            
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ============================================
// EXPOSE TRACKING GLOBALLY
// ============================================
function trackFanvueClick() {
    Tracker.trackFanvueClick();
    // Open Fanvue in new tab
    window.open(CONFIG.FANVUE_URL, '_blank');
}

// ============================================
// INTERSECTION OBSERVER FOR SECTIONS
// ============================================
function initSectionTracking() {
    const sections = document.querySelectorAll('section');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                Tracker.trackEvent('section_view', {
                    section: entry.target.id || entry.target.className
                });
            }
        });
    }, { threshold: 0.3 });

    sections.forEach(section => observer.observe(section));
}

// ============================================
// IP-BASED PERSONALISATION ENGINE
// ============================================
let visitorLocation = { city: '', country: '', countryCode: '' };

async function initLocationBadge() {
    const locationText = document.getElementById('location-text');
    if (!locationText) return;

    // Try multiple IP APIs for redundancy
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
            
            // Normalise different API response formats
            if (api.includes('ipapi.co')) {
                data = { city: json.city, country: json.country_name, countryCode: json.country_code };
            } else if (api.includes('ip-api.com')) {
                data = { city: json.city, country: json.country, countryCode: json.countryCode };
            } else if (api.includes('ipwho.is')) {
                data = { city: json.city, country: json.country, countryCode: json.country_code };
            }
            
            if (data && data.country) break; // Got valid data
        } catch (e) {
            continue; // Try next API
        }
    }
    
    if (!data) {
        // Safe fallback — don't guess, just show generic
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
    
    // 1. Update location badge — shows exact location
    if (isRestricted) {
        locationText.textContent = `⚠️ Limited availability in ${country}`;
        const badge = document.querySelector('.location-badge');
        badge.style.borderColor = 'rgba(255,214,0,0.3)';
        badge.style.color = '#ffd600';
        badge.style.background = 'rgba(255,214,0,0.1)';
        document.querySelector('.location-dot').style.background = '#ffd600';
    } else {
        const locationStr = city ? `${city}, ${country}` : country;
        locationText.textContent = `✅ Available in ${locationStr}`;
    }
    
    // 2. Personalise the hero tagline
    const tagline = document.querySelector('.hero-tagline');
    if (tagline && !isRestricted) {
        const greetings = [
            `Hey ${city || country}... I've been waiting for you 💋`,
            `Your ${city || country} fantasy is here 😘`,
            `Finally, someone from ${city || country} 💕`,
            `I knew you'd find me, ${city || country} 🔥`
        ];
        tagline.textContent = greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    // 3. Personalise the CTA section
    const ctaSub = document.querySelector('.cta-sub');
    if (ctaSub && !isRestricted) {
        const fanCount = Math.floor(Math.random() * 200) + 50;
        ctaSub.textContent = `🔥 ${fanCount}+ fans from ${country} already subscribed. Don't miss out 💕`;
    }
    
    // 4. Personalise the about bio
    const bioText = document.getElementById('bio-text');
    if (bioText && !isRestricted) {
        bioText.textContent = `Hey ${city || country}! I'm Stella and I've been getting so much love from fans in ${country} lately. I love connecting with people from all over the world, and I'd love to get to know you too. Join me on Fanvue for something special 💕`;
    }
    
    // 5. Update the "fans" stat to be location-aware
    const statNumber = document.querySelector('.stat-number');
    if (statNumber && !isRestricted) {
        const localFans = Math.floor(Math.random() * 500) + 100;
        statNumber.textContent = `${localFans}+`;
    }
    
    // 6. Start fake social proof notifications
    if (!isRestricted) {
        startSocialProof(city || country);
    }
}


// ============================================
// SOCIAL PROOF NOTIFICATIONS
// ============================================
let socialProofInterval = null;

function startSocialProof(location) {
    // Show first notification after 3 seconds
    setTimeout(() => showNotification(location), 3000);
    
    // Then show random notifications every 15-30 seconds
    socialProofInterval = setInterval(() => {
        showNotification(location);
    }, Math.floor(Math.random() * 15000) + 15000);
}

function showNotification(location) {
    const names = ['Mike', 'James', 'Chris', 'David', 'Alex', 'Tom', 'Ryan', 'Jake', 'Luke', 'Ben', 'Sam', 'Dan', 'Max', 'Leo', 'Kai'];
    const actions = [
        `just subscribed from ${location} 🔥`,
        `is chatting with Stella right now 💬`,
        `just unlocked exclusive content from ${location} 😈`,
        `sent a tip from ${location} 💋`,
        `just joined from ${location} 💕`
    ];
    
    const name = names[Math.floor(Math.random() * names.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    const notification = document.createElement('div');
    notification.className = 'social-proof';
    notification.innerHTML = `
        <div class="sp-avatar">${name[0]}</div>
        <div class="sp-text">
            <strong>${name}</strong> ${action}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    requestAnimationFrame(() => {
        notification.classList.add('sp-active');
    });
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('sp-active');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}


// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tracking first
    Tracker.init();
    
    // Initialize UI
    initAgeVerification();
    initNavigation();
    initGallery();
    initSmoothScroll();
    initSectionTracking();
    initLocationBadge(); // Show location-based availability

    console.log('🔥 Stella Landing Page loaded');
    console.log('📊 Tracking active - Session:', Tracker.data.sessionId);
});

