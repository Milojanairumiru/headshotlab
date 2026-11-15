/**
 * HeadshotLab Custom Theme JS
 * Engineered in Vanilla JS (ES6) for production-grade performance.
 *
 * @package HeadshotLab
 */

(function () {
	'use strict';

	// Global Theme State / Cache
	const HSL = {
		isScrolled: false,
		activePricingTab: 'individual',
		employees: [
			{
				id: 'emp_1',
				name: 'Sarah Jenkins',
				email: 'sarah.j@vanta.co',
				status: 'Approved',
				style: 'Classic Slate Studio',
				uploadDate: 'June 20, 2026',
				beforeImg: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=300&fit=crop',
				afterImg: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=300&fit=crop'
			},
			{
				id: 'emp_2',
				name: 'Marcus Vance',
				email: 'm.vance@vanta.co',
				status: 'Ready for Review',
				style: 'Modern Teal Glow',
				uploadDate: 'June 21, 2026',
				beforeImg: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=300&fit=crop',
				afterImg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=300&fit=crop'
			},
			{
				id: 'emp_3',
				name: 'Aisha Rahman',
				email: 'aisha.r@vanta.co',
				status: 'Ready for Review',
				style: 'Silicon Valley Outdoor',
				uploadDate: 'June 22, 2026',
				beforeImg: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&fit=crop',
				afterImg: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=300&fit=crop'
			},
			{
				id: 'emp_4',
				name: 'Timothy Kim',
				email: 't.kim@vanta.co',
				status: 'Awaiting Upload',
				style: 'Classic Slate Studio',
				uploadDate: 'Pending Invite',
				beforeImg: '',
				afterImg: ''
			}
		],
		dashboardFilters: {
			search: '',
			status: 'All'
		},
		intakeForm: {
			currentStep: 1,
			packageType: 'team',
			teamSize: 15,
			photoStyle: 'studio-classic',
			instructions: '',
			fullName: '',
			email: '',
			simulatedFiles: []
		}
	};

	// ----------------------------------------------------
	// 1. Initializer / Core DOM Setup
	// ----------------------------------------------------
	document.addEventListener('DOMContentLoaded', function () {
		initHeaderEffects();
		initSmoothScrolling();
		initComparisonSliders();
		initPortfolioFilter();
		initDashboardPortal();
		initPricingCalculator();
		initFAQAccordion();
		initIntakeWizard();
		initContactForms();
		initConversionTools();
	});

	// Helper to scroll smoothly to a section
	function scrollToSection(sectionId) {
		const target = document.getElementById(sectionId);
		if (target) {
			const offset = 96; // navbar height offset
			const elementPosition = target.getBoundingClientRect().top;
			const offsetPosition = elementPosition + window.pageYOffset - offset;

			window.scrollTo({
				top: offsetPosition,
				behavior: 'smooth'
			});
		}
	}

	// Helper to check email validity
	function isValidEmail(email) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	// ----------------------------------------------------
	// 2. Header Effects (Sticky Scroll, Login Modal, Hamburger)
	// ----------------------------------------------------
	function initHeaderEffects() {
		const navbar = document.getElementById('navbar-main');
		const mobileHamburger = document.getElementById('btn-mobile-hamburger');
		const mobileDrawer = document.getElementById('mobile-drawer-menu');
		const loginBtn = document.getElementById('btn-nav-login');
		const mobileLoginBtn = document.getElementById('btn-mobile-login');
		const loginModal = document.getElementById('login-modal');
		const loginModalClose = document.getElementById('btn-login-modal-close');
		const loginForm = document.getElementById('login-form');
		const loginErrorAlert = document.getElementById('login-error-alert');
		const loginErrorText = document.getElementById('login-error-text');
		const loginSuccessScreen = document.getElementById('login-success-screen');

		// Handle Scroll sticky state
		window.addEventListener('scroll', function () {
			if (window.scrollY > 40) {
				if (!HSL.isScrolled) {
					HSL.isScrolled = true;
					navbar.classList.remove('h-[92px]', 'bg-[#EAEAE2]/60', 'backdrop-blur-sm');
					navbar.classList.add('h-[76px]', 'bg-[#EAEAE2]/95', 'backdrop-blur-md', 'shadow-[0_4px_24px_rgba(0,0,0,0.06)]', 'border-b', 'border-[#D5D4CC]');
					navbar.style.top = '0px';
				}
			} else {
				if (HSL.isScrolled) {
					HSL.isScrolled = false;
					navbar.classList.remove('h-[76px]', 'bg-[#EAEAE2]/95', 'backdrop-blur-md', 'shadow-[0_4px_24px_rgba(0,0,0,0.06)]', 'border-b', 'border-[#D5D4CC]');
					navbar.classList.add('h-[92px]', 'bg-[#EAEAE2]/60', 'backdrop-blur-sm');
					navbar.style.top = '';
				}
			}
		});

		// Mobile Hamburger Menu Trigger
		if (mobileHamburger) {
			mobileHamburger.addEventListener('click', function () {
				mobileDrawer.classList.toggle('hidden');
				mobileDrawer.classList.toggle('flex');
				const isOpen = !mobileDrawer.classList.contains('hidden');
				mobileHamburger.innerHTML = isOpen ? HSL_SVGS.x : HSL_SVGS.menu;
			});
		}

		// Login Modal opening
		const openLogin = () => {
			loginModal.classList.remove('hidden');
			mobileDrawer.classList.add('hidden');
			if (mobileHamburger) {
				mobileHamburger.innerHTML = HSL_SVGS.menu;
			}
		};

		if (loginBtn) loginBtn.addEventListener('click', openLogin);
		if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', openLogin);

		// Close Login Modal
		const closeLogin = () => {
			loginModal.classList.add('hidden');
			loginForm.classList.remove('hidden');
			loginSuccessScreen.classList.add('hidden');
			loginErrorAlert.classList.add('hidden');
			loginForm.reset();
		};

		if (loginModalClose) loginModalClose.addEventListener('click', closeLogin);
		loginModal.querySelector('.modal-overlay').addEventListener('click', closeLogin);

		// Handle login form submission
		if (loginForm) {
			loginForm.addEventListener('submit', function (e) {
				e.preventDefault();
				const email = document.getElementById('modal-email-field').value.trim();
				const pass = document.getElementById('modal-password-field').value.trim();

				if (!email || !pass) {
					loginErrorText.textContent = 'Please populate both employee email and verification password.';
					loginErrorAlert.classList.remove('hidden');
					return;
				}
				if (!isValidEmail(email)) {
					loginErrorText.textContent = 'Invalid business email format.';
					loginErrorAlert.classList.remove('hidden');
					return;
				}

				// Validation logic matching React
				if (email === 'sarah.j@vanta.co' && pass === 'vanta123') {
					loginErrorAlert.classList.add('hidden');
					loginForm.classList.add('hidden');
					loginSuccessScreen.classList.remove('hidden');

					setTimeout(function () {
						closeLogin();
						scrollToSection('dashboard-portal-section');
					}, 1500);
				} else {
					loginErrorText.textContent = 'Invalid credentials. Access Denied.';
					loginErrorAlert.classList.remove('hidden');
				}
			});
		}
	}

	// ----------------------------------------------------
	// 3. Smooth Scrolling & Action Triggers
	// ----------------------------------------------------
	function initSmoothScrolling() {
		// Navigation anchor links
		const anchors = document.querySelectorAll('.nav-anchor, .m-nav-anchor');
		anchors.forEach(function (anchor) {
			anchor.addEventListener('click', function (e) {
				e.preventDefault();
				const targetSection = this.getAttribute('data-target');
				
				// Hide Mobile drawer if open
				const mobileDrawer = document.getElementById('mobile-drawer-menu');
				const mobileHamburger = document.getElementById('btn-mobile-hamburger');
				if (mobileDrawer && !mobileDrawer.classList.contains('hidden')) {
					mobileDrawer.classList.add('hidden');
					mobileHamburger.innerHTML = HSL_SVGS.menu;
				}

				scrollToSection(targetSection);
			});
		});

		// Hero Action Buttons
		const intakeButtons = document.querySelectorAll('.btn-scroll-to-intake, #btn-nav-cta, #btn-mobile-cta');
		intakeButtons.forEach(button => {
			button.addEventListener('click', () => scrollToSection('intake-wizard-section'));
		});

		const portfolioButtons = document.querySelectorAll('.btn-scroll-to-portfolio');
		portfolioButtons.forEach(button => {
			button.addEventListener('click', () => scrollToSection('examples-section'));
		});
	}

	// ----------------------------------------------------
	// 4. Before/After Comparison Sliders Class
	// ----------------------------------------------------
	class CompareSlider {
		constructor(container) {
			this.container = container;
			this.beforeImg = container.querySelector('.slider-before-img');
			this.beforeOverlay = container.querySelector('.slider-before-overlay');
			this.handle = container.querySelector('.slider-handle');
			this.isDragging = false;
			this.position = 50; // percentage position

			// Variant control properties (for main hero slider)
			this.variantBtns = container.closest('.hsl-compare-slider')?.querySelectorAll('.slider-variant-selector button');
			this.afterImg = container.querySelector('.slider-after-img');
			this.descBox = container.closest('.hsl-compare-slider')?.querySelector('.slider-desc');
			this.badgeBox = container.closest('.hsl-compare-slider')?.querySelector('.slider-badge');
			this.labelAfter = container.querySelector('.slider-label-after');
			this.iconBox = container.querySelector('.slider-icon-box');
			this.indicatorText = container.querySelector('.slider-indicator-text');

			this.variants = {
				original: {
					name: 'Raw Smartphone Selfie',
					badge: 'RAW INPUT',
					badgeClass: 'bg-gray-200 text-gray-800 border-gray-300',
					desc: 'Typical unretouched mobile selfie with flat, direct smartphone lens flash and stray flyaway hairs.',
					filter: 'brightness-90 grayscale-[10%]',
					image: container.getAttribute('data-before'),
					icon: '<span></span>'
				},
				ai_edited: {
					name: 'Automated AI Pixel-Mesh',
					badge: 'AUTOMATED AI DRAFT',
					badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
					desc: 'Generative AI avatar filter output. Features typical plastic-smooth synthetic skin, slightly distorted eye shapes, and artificial shine.',
					filter: 'contrast-[1.02] brightness-[1.04] saturate-[1.3] blur-[0.3px]',
					image: container.getAttribute('data-after'),
					icon: HSL_SVGS.zap
				},
				human_retouched: {
					name: 'Artisanal Hand-Sculpted',
					badge: 'HUMAN PORTRAIT DESIGN',
					badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
					desc: 'Retouched by a human designer. Stray hairs removed, clothing perspective aligned, natural skin textures and pore depths fully preserved.',
					filter: 'brightness-100 contrast-100 object-cover',
					image: container.getAttribute('data-after'),
					icon: HSL_SVGS.award
				},
				hybrid_enhanced: {
					name: 'Lab-Max™ Hybrid',
					badge: 'PROFESSIONAL RETOUCH + AI ENHANCEMENT',
					badgeClass: 'bg-[#F29D12]/20 text-gray-900 border-[#F29D12]',
					desc: 'The ultimate standard. Hand-sculpted retouch combined with strategic micro-contrast sharpening, studio bokeh simulation, and rich color balancing.',
					filter: 'contrast-[1.05] brightness-[1.02] saturate-[1.02] drop-shadow-[0_0_8px_rgba(242,157,18,0.15)] shadow-inner',
					image: container.getAttribute('data-after'),
					icon: HSL_SVGS.flame
				}
			};

			this.init();
		}

		init() {
			// Bind dragging actions
			this.container.addEventListener('mousedown', this.startDrag.bind(this));
			window.addEventListener('mouseup', this.stopDrag.bind(this));
			window.addEventListener('mousemove', this.drag.bind(this));

			this.container.addEventListener('touchstart', this.startDrag.bind(this));
			window.addEventListener('touchend', this.stopDrag.bind(this));
			window.addEventListener('touchmove', this.drag.bind(this));

			// Keyboard support
			this.container.addEventListener('keydown', this.handleKey.bind(this));

			// Initialize overlay width matching
			window.addEventListener('resize', this.updateSize.bind(this));
			this.updateSize();

			// Bind Tab selector items
			if (this.variantBtns) {
				this.variantBtns.forEach(btn => {
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const variantId = btn.getAttribute('data-variant');
						this.selectVariant(variantId);
					});
				});
			}
		}

		updateSize() {
			const width = this.container.offsetWidth;
			if (this.beforeImg) {
				this.beforeImg.style.width = width + 'px';
				this.beforeImg.style.maxWidth = 'none';
			}
			this.setSliderPosition(this.position);
		}

		setSliderPosition(percent) {
			this.position = percent;
			this.beforeOverlay.style.width = percent + '%';
			this.handle.style.left = percent + '%';
		}

		startDrag(e) {
			this.isDragging = true;
			this.drag(e);
		}

		stopDrag() {
			this.isDragging = false;
		}

		drag(e) {
			if (!this.isDragging) return;
			const clientX = e.clientX || (e.touches && e.touches[0].clientX);
			if (clientX === undefined) return;

			const rect = this.container.getBoundingClientRect();
			const x = clientX - rect.left;
			const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
			this.setSliderPosition(percentage);
		}

		handleKey(e) {
			if (e.key === 'ArrowLeft') {
				this.setSliderPosition(Math.max(0, this.position - 5));
			} else if (e.key === 'ArrowRight') {
				this.setSliderPosition(Math.min(100, this.position + 5));
			}
		}

		selectVariant(variantId) {
			const variant = this.variants[variantId];
			if (!variant) return;

			// Swap tab active class states
			this.variantBtns.forEach(btn => {
				const isCurrent = btn.getAttribute('data-variant') === variantId;
				btn.className = isCurrent 
					? 'py-3 px-2 lg:px-4 rounded-xl text-left transition-all relative cursor-pointer flex flex-col justify-between min-h-[75px] bg-white text-gray-900 shadow-md border-2 border-gray-900 ring-2 ring-[#F29D12]'
					: 'py-3 px-2 lg:px-4 rounded-xl text-left transition-all relative cursor-pointer flex flex-col justify-between min-h-[75px] bg-white hover:bg-gray-50 text-gray-600 border border-gray-200';
				
				// Pulse dot helper
				const dot = btn.querySelector('.rounded-full');
				if (dot) dot.remove();
				if (isCurrent) {
					const indicator = document.createElement('span');
					indicator.className = 'w-2.5 h-2.5 rounded-full bg-[#F29D12] animate-pulse absolute top-3 right-3';
					btn.appendChild(indicator);
				}
			});

			// Swap texts
			if (this.descBox) this.descBox.textContent = variant.desc;
			if (this.badgeBox) {
				this.badgeBox.textContent = variant.badge;
				this.badgeBox.className = 'slider-badge text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded border ' + variant.badgeClass;
			}
			if (this.labelAfter) this.labelAfter.textContent = variant.name;
			if (this.iconBox) this.iconBox.innerHTML = variant.icon;
			if (this.indicatorText) this.indicatorText.textContent = 'Raw Selfie vs ' + variant.name;

			// Swap image filter and source
			if (this.afterImg) {
				this.afterImg.src = variant.image;
				this.afterImg.className = 'slider-after-img absolute top-0 left-0 w-full h-full object-cover pointer-events-none transition-all duration-300 ' + variant.filter;
			}
		}
	}

	function initComparisonSliders() {
		const sliderContainers = document.querySelectorAll('.slider-stage-container');
		sliderContainers.forEach(container => {
			new CompareSlider(container);
		});
	}

	// ----------------------------------------------------
	// 5. Portfolio Filter
	// ----------------------------------------------------
	function initPortfolioFilter() {
		const categoryButtons = document.querySelectorAll('.cat-btn');
		const portfolioCards = document.querySelectorAll('.portfolio-item-card');

		categoryButtons.forEach(button => {
			button.addEventListener('click', function () {
				const activeCategory = this.getAttribute('data-category');

				// Update button colors
				categoryButtons.forEach(btn => {
					btn.className = 'cat-btn px-5 py-2 rounded-full text-xs font-mono tracking-tight transition-all duration-200 cursor-pointer bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300';
				});
				this.className = 'cat-btn px-5 py-2 rounded-full text-xs font-mono tracking-tight transition-all duration-200 cursor-pointer bg-[#C9A227] text-white font-bold shadow-md';

				// Filter cards
				portfolioCards.forEach(card => {
					const cardCategory = card.getAttribute('data-cat');
					if (activeCategory === 'all' || cardCategory === activeCategory) {
						card.style.display = 'flex';
						card.classList.add('animate-fadeIn');
					} else {
						card.style.display = 'none';
						card.classList.remove('animate-fadeIn');
					}
				});

				// Re-initialize overlay image sizes for visible sliders inside cards
				setTimeout(() => {
					const visibleSliders = document.querySelectorAll('.portfolio-item-card:not([style*="display: none"]) .slider-stage-container');
					visibleSliders.forEach(container => {
						const width = container.offsetWidth;
						const beforeImg = container.querySelector('.slider-before-img');
						if (beforeImg) {
							beforeImg.style.width = width + 'px';
						}
					});
				}, 50);
			});
		});
	}

	// ----------------------------------------------------
	// 6. Central Directory Portal (Simulated Dashboard)
	// ----------------------------------------------------
	function initDashboardPortal() {
		const searchInput = document.getElementById('dashboard-search-input');
		const filterButtons = document.querySelectorAll('.dash-filter-btn');
		const downloadAllBtn = document.getElementById('btn-dashboard-download-all');

		if (!searchInput) return;

		// Search handler
		searchInput.addEventListener('input', function () {
			HSL.dashboardFilters.search = this.value.trim();
			renderDashboardTable();
		});

		// Status filter buttons
		filterButtons.forEach(btn => {
			btn.addEventListener('click', function () {
				filterButtons.forEach(b => {
					b.className = 'dash-filter-btn px-3 py-1.5 rounded-full text-[10px] font-mono whitespace-nowrap cursor-pointer bg-white border border-gray-200 text-gray-500 hover:text-gray-900';
				});
				this.className = 'dash-filter-btn px-3 py-1.5 rounded-full text-[10px] font-mono whitespace-nowrap cursor-pointer bg-[#C9A227] text-white font-bold shadow-sm';
				
				HSL.dashboardFilters.status = this.getAttribute('data-filter');
				renderDashboardTable();
			});
		});

		// Download directory zip action
		if (downloadAllBtn) {
			downloadAllBtn.addEventListener('click', function () {
				showDashboardToast('Generating high-resolution consolidated ZIP volume (24.1 MB)...');
			});
		}

		// Initial rendering of Table
		renderDashboardTable();
	}

	function showDashboardToast(msg) {
		const toast = document.getElementById('dashboard-feedback-toast');
		const toastText = document.getElementById('dashboard-toast-message');
		if (toast && toastText) {
			toastText.textContent = msg;
			toast.classList.remove('hidden');
			setTimeout(function () {
				toast.classList.add('hidden');
			}, 4000);
		}
	}

	function renderDashboardTable() {
		const rowsContainer = document.getElementById('dashboard-employees-rows');
		if (!rowsContainer) return;

		const query = HSL.dashboardFilters.search.toLowerCase();
		const statusFilter = HSL.dashboardFilters.status;

		const filtered = HSL.employees.filter(emp => {
			const matchesSearch = emp.name.toLowerCase().includes(query) || emp.email.toLowerCase().includes(query);
			const matchesFilter = statusFilter === 'All' || emp.status === statusFilter;
			return matchesSearch && matchesFilter;
		});

		// Empty state
		if (filtered.length === 0) {
			rowsContainer.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400 font-mono text-xs">No employee records match the parameters.</td></tr>';
			return;
		}

		rowsContainer.innerHTML = '';
		filtered.forEach(emp => {
			const row = document.createElement('tr');
			row.className = 'hover:bg-gray-55/50 border-b border-gray-100 transition-colors duration-150';

			// Column 1: Profile Name
			const c1 = document.createElement('td');
			c1.className = 'py-4 px-6';
			c1.innerHTML = `
				<div class="flex items-center space-x-3">
					<div class="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-gray-600 uppercase font-mono">
						${emp.name.charAt(0)}
					</div>
					<div>
						<div class="font-bold text-gray-900 text-sm font-sans">${emp.name}</div>
						<div class="text-[10px] font-mono text-gray-400 mt-0.5">${emp.email}</div>
					</div>
				</div>
			`;
			row.appendChild(c1);

			// Column 2: Photo Comparer
			const c2 = document.createElement('td');
			c2.className = 'py-4 px-6';
			if (emp.status === 'Awaiting Upload') {
				c2.innerHTML = `
					<div class="flex items-center space-x-2 text-[10px] font-mono text-gray-400">
						${HSL_SVGS.alertCircle}
						<span>Employee has not submitted photos yet.</span>
					</div>
				`;
			} else {
				c2.innerHTML = `
					<div class="flex items-center space-x-4">
						<div class="relative group/thumb cursor-zoom-in">
							<img src="${emp.beforeImg}" alt="Before" class="w-12 h-14 object-cover rounded-md border border-gray-200 filter grayscale">
							<span class="absolute bottom-0 inset-x-0 bg-black/70 text-[7px] text-center font-mono py-0.5 text-gray-300">BEFORE</span>
						</div>
						<div class="text-gray-350 font-mono text-[10px]">➔</div>
						<div class="relative group/thumb cursor-zoom-in">
							<img src="${emp.afterImg}" alt="After" class="w-12 h-14 object-cover rounded-md border-2 border-[#C9A227]">
							<span class="absolute bottom-0 inset-x-0 bg-[#C9A227]/90 text-[7px] text-white font-mono text-center py-0.5 font-bold">AFTER</span>
						</div>
					</div>
				`;
			}
			row.appendChild(c2);

			// Column 3: Creative Style
			const c3 = document.createElement('td');
			c3.className = 'py-4 px-6 font-mono text-[10px]';
			if (emp.status === 'Awaiting Upload') {
				c3.innerHTML = '<span class="text-gray-400">--</span>';
			} else {
				c3.innerHTML = `
					<div>
						<span class="text-gray-700 block">${emp.style}</span>
						<span class="text-gray-400 text-[9px] block mt-0.5">Submitted: ${emp.uploadDate}</span>
					</div>
				`;
			}
			row.appendChild(c3);

			// Column 4: Actions controls
			const c4 = document.createElement('td');
			c4.className = 'py-4 px-6';

			if (emp.status === 'Approved') {
				c4.innerHTML = `
					<div class="flex items-center space-x-1.5 text-[#C9A227] font-mono font-bold text-[10px]">
						${HSL_SVGS.checkCircle}
						<span>APPROVED TO DIRECTORY</span>
					</div>
				`;
			} else if (emp.status === 'Ready for Review') {
				const appBtn = document.createElement('button');
				appBtn.className = 'bg-[#C9A227] hover:bg-[#b08d20] text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all inline-flex items-center space-x-1 cursor-pointer mr-2';
				appBtn.innerHTML = HSL_SVGS.check + '<span>Approve</span>';
				appBtn.addEventListener('click', function () {
					emp.status = 'Approved';
					showDashboardToast(`Success: Approved headshot for ${emp.name}`);
					updateDashboardStats();
					renderDashboardTable();
				});

				const revBtn = document.createElement('button');
				revBtn.className = 'bg-white hover:bg-gray-50 text-gray-600 font-mono text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all cursor-pointer';
				revBtn.innerHTML = '<span>Revision</span>';
				revBtn.addEventListener('click', function () {
					emp.status = 'Revision Requested';
					showDashboardToast(`Revision requested: Human editor notified for ${emp.name}`);
					updateDashboardStats();
					renderDashboardTable();
				});

				c4.appendChild(appBtn);
				c4.appendChild(revBtn);
			} else if (emp.status === 'Revision Requested') {
				c4.innerHTML = `
					<div class="flex items-center space-x-1.5 text-amber-600 font-mono font-bold text-[10px]">
						<span class="animate-spin">${HSL_SVGS.refreshCcw}</span>
						<span>Revision Process in-flight...</span>
					</div>
				`;
			} else if (emp.status === 'Awaiting Upload') {
				const pingBtn = document.createElement('button');
				pingBtn.className = 'bg-white hover:bg-gray-50 border border-gray-200 font-mono text-[10px] text-gray-505 font-bold px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 group cursor-pointer';
				pingBtn.innerHTML = HSL_SVGS.send + '<span class="ml-1.5">Ping Reminder</span>';
				pingBtn.addEventListener('click', function () {
					showDashboardToast(`Reminder Sent: Onboarding invite re-pinged to ${emp.name}`);
				});
				c4.appendChild(pingBtn);
			}

			row.appendChild(c4);
			rowsContainer.appendChild(row);
		});

		updateDashboardStats();
	}

	function updateDashboardStats() {
		const approvedCount = HSL.employees.filter(e => e.status === 'Approved').length;
		const reviewCount = HSL.employees.filter(e => e.status === 'Ready for Review').length;

		const approvedBox = document.getElementById('approved-stat-count');
		const reviewBox = document.getElementById('review-stat-count');

		if (approvedBox) approvedBox.textContent = approvedCount + ' online';
		if (reviewBox) reviewBox.textContent = reviewCount + ' reviews';
	}

	// ----------------------------------------------------
	// 7. Pricing Calculator
	// ----------------------------------------------------
	function initPricingCalculator() {
		const tabIndiv = document.getElementById('btn-pricing-tab-individual');
		const tabTeams = document.getElementById('btn-pricing-tab-teams');
		const gridIndiv = document.getElementById('pricing-individual-grid');
		const calcTeams = document.getElementById('pricing-teams-calculator');
		const seatRange = document.getElementById('pricing-team-range');
		const seatCounter = document.getElementById('pricing-team-member-counter');
		
		const toggleGridBtn = document.getElementById('btn-toggle-comparison-grid');
		const gridContainer = document.getElementById('pricing-comparison-table-container');

		if (!tabIndiv) return;

		// Tab individual action
		tabIndiv.addEventListener('click', function () {
			tabIndiv.className = 'px-5 py-2.5 rounded-full text-xs font-mono tracking-tight transition-all duration-200 flex items-center space-x-2 cursor-pointer bg-gray-950 text-white font-bold shadow-sm';
			tabTeams.className = 'px-5 py-2.5 rounded-full text-xs font-mono tracking-tight transition-all duration-200 flex items-center space-x-2 cursor-pointer text-gray-500 hover:text-gray-900';
			gridIndiv.classList.remove('hidden');
			calcTeams.classList.add('hidden');
			HSL.activePricingTab = 'individual';
		});

		// Tab teams action
		tabTeams.addEventListener('click', function () {
			tabTeams.className = 'px-5 py-2.5 rounded-full text-xs font-mono tracking-tight transition-all duration-200 flex items-center space-x-2 cursor-pointer bg-gray-950 text-white font-bold shadow-sm';
			tabIndiv.className = 'px-5 py-2.5 rounded-full text-xs font-mono tracking-tight transition-all duration-200 flex items-center space-x-2 cursor-pointer text-gray-500 hover:text-gray-900';
			gridIndiv.classList.add('hidden');
			calcTeams.classList.remove('hidden');
			HSL.activePricingTab = 'teams';
			calculateTeamPricing(parseInt(seatRange.value));
		});

		// Range slider controls
		if (seatRange) {
			seatRange.addEventListener('input', function () {
				const size = parseInt(this.value);
				seatCounter.textContent = size;
				calculateTeamPricing(size);
			});
		}

		// Selection triggers linked to intake wizard step 1
		const selectBtns = document.querySelectorAll('.btn-select-pricing-plan, #btn-teams-cta-pricing');
		selectBtns.forEach(btn => {
			btn.addEventListener('click', function () {
				const planType = this.getAttribute('data-plan') || 'team';
				const size = parseInt(this.getAttribute('data-size') || seatRange.value);

				// Update Wizard step 1 choices
				const wizardIndiv = document.getElementById('btn-wizard-individual');
				const wizardTeam = document.getElementById('btn-wizard-team');
				const sizeContainer = document.getElementById('wizard-team-size-container');
				const sizeInput = document.getElementById('wizard-team-size-input');

				if (planType === 'individual') {
					HSL.intakeForm.packageType = 'individual';
					if (wizardIndiv) {
						wizardIndiv.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-[#C9A227] bg-[#C9A227]/5 shadow-sm';
						wizardIndiv.querySelector('.check-icon-check').classList.remove('hidden');
					}
					if (wizardTeam) {
						wizardTeam.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-gray-200 bg-white hover:border-gray-300';
						wizardTeam.querySelector('.check-icon-check').classList.add('hidden');
					}
					if (sizeContainer) sizeContainer.classList.add('hidden');
				} else {
					HSL.intakeForm.packageType = 'team';
					HSL.intakeForm.teamSize = size;
					if (sizeInput) sizeInput.value = size;
					if (wizardTeam) {
						wizardTeam.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-[#C9A227] bg-[#C9A227]/5 shadow-sm';
						wizardTeam.querySelector('.check-icon-check').classList.remove('hidden');
					}
					if (wizardIndiv) {
						wizardIndiv.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-gray-200 bg-white hover:border-gray-300';
						wizardIndiv.querySelector('.check-icon-check').classList.add('hidden');
					}
					if (sizeContainer) sizeContainer.classList.remove('hidden');
				}

				// Scroll directly to Intake wizard
				scrollToSection('intake-wizard-section');
			});
		});

		// Toggle Comparison Grid
		if (toggleGridBtn) {
			toggleGridBtn.addEventListener('click', function () {
				gridContainer.classList.toggle('hidden');
				const isClosed = gridContainer.classList.contains('hidden');
				toggleGridBtn.querySelector('svg').className = 'lucide lucide-chevron-down w-4 h-4 text-[#C9A227] transition-all ' + (isClosed ? '' : 'rotate-180');
			});
		}
	}

	function calculateTeamPricing(size) {
		let perMemberFee = 40;
		let headshotsPerMember = 2;
		let tierName = "Starter Team";
		let turnaround = "48 hours";

		if (size >= 101) {
			perMemberFee = 25;
			headshotsPerMember = 4;
			tierName = "Enterprise Global";
			turnaround = "72 hours";
		} else if (size >= 21) {
			perMemberFee = 28;
			headshotsPerMember = 3;
			tierName = "Corporate Growth";
			turnaround = "48 hours";
		} else if (size >= 6) {
			perMemberFee = 32;
			headshotsPerMember = 3;
			tierName = "Studio Team Pro";
			turnaround = "48 hours";
		}

		const total = size * perMemberFee;
		const savingsPercentage = Math.round(((40 - perMemberFee) / 40) * 100);

		// DOM selectors updates
		const tierLabel = document.getElementById('pricing-tier-label-calc');
		const calcRate = document.getElementById('txt-calc-rate');
		const calcSavingsBox = document.getElementById('pricing-calc-savings-box');
		const calcSavings = document.getElementById('txt-calc-savings');
		const calcItemized = document.getElementById('txt-calc-itemized');
		const calcSubtotal = document.getElementById('txt-calc-subtotal');
		const calcTurnaround = document.getElementById('txt-calc-turnaround');
		const calcTotal = document.getElementById('txt-calc-total');
		const calcPhotosCount = document.getElementById('txt-calc-photos-count');

		if (tierLabel) tierLabel.textContent = tierName;
		if (calcRate) calcRate.textContent = '$' + perMemberFee;
		if (calcPhotosCount) calcPhotosCount.textContent = headshotsPerMember + ' master retouches per employee';

		if (savingsPercentage > 0) {
			if (calcSavingsBox) calcSavingsBox.classList.remove('hidden');
			if (calcSavings) calcSavings.textContent = savingsPercentage + '% bulk markdown';
		} else {
			if (calcSavingsBox) calcSavingsBox.classList.add('hidden');
		}

		if (calcItemized) calcItemized.textContent = size + 'x Remote employees rate:';
		if (calcSubtotal) calcSubtotal.textContent = '$' + total;
		if (calcTurnaround) calcTurnaround.textContent = turnaround;
		if (calcTotal) calcTotal.textContent = '$' + total;

		// Highlight tier badge outlines
		const starterBadge = document.getElementById('badge-pricing-starter');
		const growthBadge = document.getElementById('badge-pricing-growth');
		const globalBadge = document.getElementById('badge-pricing-global');

		if (starterBadge) starterBadge.className = 'p-4 rounded-xl border text-center transition-all bg-white border-gray-250';
		if (growthBadge) growthBadge.className = 'p-4 rounded-xl border text-center transition-all bg-white border-gray-250';
		if (globalBadge) globalBadge.className = 'p-4 rounded-xl border text-center transition-all bg-white border-gray-250';

		if (size <= 5) {
			if (starterBadge) starterBadge.className = 'p-4 rounded-xl border text-center transition-all border-[#C9A227] bg-[#C9A227]/5 ring-1 ring-[#C9A227]';
		} else if (size >= 6 && size <= 20) {
			if (growthBadge) growthBadge.className = 'p-4 rounded-xl border text-center transition-all border-[#C9A227] bg-[#C9A227]/5 ring-1 ring-[#C9A227]';
		} else {
			if (globalBadge) globalBadge.className = 'p-4 rounded-xl border text-center transition-all border-[#C9A227] bg-[#C9A227]/5 ring-1 ring-[#C9A227]';
		}
	}

	// ----------------------------------------------------
	// 8. FAQ Accordions
	// ----------------------------------------------------
	function initFAQAccordion() {
		const faqItems = document.querySelectorAll('.faq-item');

		faqItems.forEach(item => {
			const button = item.querySelector('button');
			const content = item.querySelector('.faq-content');
			const arrowBox = item.querySelector('.faq-arrow-box');

			button.addEventListener('click', function () {
				const isCurrentlyOpen = !content.classList.contains('max-h-0');

				// Close all other FAQs
				faqItems.forEach(other => {
					const otherContent = other.querySelector('.faq-content');
					const otherBtn = other.querySelector('button');
					const otherArrow = other.querySelector('.faq-arrow-box');
					
					otherContent.classList.add('max-h-0', 'opacity-0', 'overflow-hidden', 'pointer-events-none');
					otherContent.classList.remove('max-h-[300px]', 'border-t', 'border-gray-100', 'opacity-100');
					otherBtn.setAttribute('aria-expanded', 'false');
					if (otherArrow) otherArrow.className = 'faq-arrow-box w-6 h-6 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 transition-all duration-300';
				});

				if (!isCurrentlyOpen) {
					content.classList.remove('max-h-0', 'opacity-0', 'overflow-hidden', 'pointer-events-none');
					content.classList.add('max-h-[300px]', 'border-t', 'border-gray-100', 'opacity-100');
					button.setAttribute('aria-expanded', 'true');
					arrowBox.className = 'faq-arrow-box w-6 h-6 rounded-full bg-[#C9A227]/10 border-[#C9A227]/20 text-[#C9A227] flex items-center justify-center transition-all duration-300 rotate-180';
				}
			});
		});
	}

	// ----------------------------------------------------
	// 9. Multi-Step Intake Wizard
	// ----------------------------------------------------
	function initIntakeWizard() {
		const wizard = document.getElementById('intake-form-wizard');
		if (!wizard) return;

		// Step Navigation
		const btnNext = document.getElementById('btn-next-step'); // Wait, the ID in HTML is btn-wizard-next
		const btnWizardNext = document.getElementById('btn-wizard-next');
		const btnWizardBack = document.getElementById('btn-wizard-back');
		const btnWizardSubmit = document.getElementById('btn-wizard-submit');
		const wizardSpacer = document.getElementById('btn-wizard-spacer');

		const stepSlides = document.querySelectorAll('.wizard-step-slide');
		const stepTrackers = document.querySelectorAll('.wizard-step-progress');
		const wizardErrorAlert = document.getElementById('wizard-error-alert');
		const wizardErrorText = document.getElementById('wizard-error-text');

		// Step 1 buttons
		const btnIndiv = document.getElementById('btn-wizard-individual');
		const btnTeam = document.getElementById('btn-wizard-team');
		const sizeContainer = document.getElementById('wizard-team-size-container');
		const teamSizeInput = document.getElementById('wizard-team-size-input');

		// Step 2 buttons
		const styleBtns = document.querySelectorAll('.wizard-style-btn');

		// Step 3 buttons
		const btnSimulateUpload = document.getElementById('btn-wizard-simulate-upload');
		const dropzoneMock = document.getElementById('dropzone-mock');
		const uploadTeamInfo = document.getElementById('wizard-upload-team-info');
		const uploadIndivZone = document.getElementById('wizard-upload-individual-zone');
		const cacheFilesList = document.getElementById('dropzone-files-list');
		const simulatedListContainer = document.getElementById('simulated-files-list');

		// Step 4 inputs
		const nameInput = document.getElementById('wizard-full-name-input');
		const emailInput = document.getElementById('wizard-email-input');
		const notesInput = document.getElementById('wizard-instructions-input');

		// Success block
		const successCard = document.getElementById('intake-success-state');
		const btnResetIntake = document.getElementById('btn-intake-reset');

		// Initial Sync
		const syncWizardType = () => {
			if (HSL.intakeForm.packageType === 'individual') {
				btnIndiv.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-[#C9A227] bg-[#C9A227]/5 shadow-sm';
				btnIndiv.querySelector('.check-icon-check').classList.remove('hidden');
				btnTeam.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-gray-200 bg-white hover:border-gray-300';
				btnTeam.querySelector('.check-icon-check').classList.add('hidden');
				sizeContainer.classList.add('hidden');

				// Update upload descriptions
				document.getElementById('wizard-upload-title').textContent = 'Upload raw camera templates';
				document.getElementById('wizard-upload-desc').textContent = 'Select 2-3 casual portraits. They do not need to look good! Smartphone snapshots, selfies, or casual office shots are ideal.';
				btnSimulateUpload.classList.remove('hidden');
				uploadTeamInfo.classList.add('hidden');
				uploadIndivZone.classList.remove('hidden');
			} else {
				btnTeam.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-[#C9A227] bg-[#C9A227]/5 shadow-sm';
				btnTeam.querySelector('.check-icon-check').classList.remove('hidden');
				btnIndiv.className = 'p-5 rounded-xl border text-left transition-all cursor-pointer border-gray-200 bg-white hover:border-gray-300';
				btnIndiv.querySelector('.check-icon-check').classList.add('hidden');
				sizeContainer.classList.remove('hidden');

				// Update upload descriptions
				document.getElementById('wizard-upload-title').textContent = 'Configure team photo paths';
				document.getElementById('wizard-upload-desc').textContent = 'For remote departments, team members upload their own photos directly via private, secure onboarding web links sent after setup.';
				btnSimulateUpload.classList.add('hidden');
				uploadTeamInfo.classList.remove('hidden');
				uploadIndivZone.classList.add('hidden');
			}
		};

		// Bind step 1 triggers
		if (btnIndiv) {
			btnIndiv.addEventListener('click', function () {
				HSL.intakeForm.packageType = 'individual';
				syncWizardType();
			});
		}
		if (btnTeam) {
			btnTeam.addEventListener('click', function () {
				HSL.intakeForm.packageType = 'team';
				syncWizardType();
			});
		}

		if (teamSizeInput) {
			teamSizeInput.addEventListener('input', function () {
				HSL.intakeForm.teamSize = Math.max(1, parseInt(this.value) || 1);
			});
		}

		// Bind step 2 triggers
		styleBtns.forEach(btn => {
			btn.addEventListener('click', function () {
				styleBtns.forEach(b => {
					b.className = 'wizard-style-btn p-4 rounded-xl border text-left transition-all cursor-pointer border-gray-200 bg-white hover:border-gray-300';
					b.querySelector('.check-style-icon').classList.add('hidden');
				});
				this.className = 'wizard-style-btn p-4 rounded-xl border text-left transition-all cursor-pointer border-[#C9A227] bg-[#C9A227]/5 shadow-sm';
				this.querySelector('.check-style-icon').classList.remove('hidden');
				HSL.intakeForm.photoStyle = this.getAttribute('data-style-id');
			});
		});

		// Bind step 3 simulated uploads
		const simulatePhotoUpload = () => {
			const cacheList = [
				'IMG_4901_selfie_outdoor.heic (4.2 MB)',
				'IMG_4902_neutral_expression.heic (3.9 MB)',
				'IMG_4903_workspace_pose.jpeg (2.1 MB)'
			];
			HSL.intakeForm.simulatedFiles = cacheList;
			simulatedListContainer.innerHTML = '';
			cacheList.forEach(name => {
				const fileRow = document.createElement('div');
				fileRow.className = 'flex justify-between items-center bg-white px-3 py-1.5 rounded text-xs font-mono border border-gray-200';
				fileRow.innerHTML = `<span class="text-gray-700 truncate">${name}</span><span class="text-[#C9A227] text-[10px] font-black">READY</span>`;
				simulatedListContainer.appendChild(fileRow);
			});
			cacheFilesList.classList.remove('hidden');
			wizardErrorAlert.classList.add('hidden');
		};

		if (btnSimulateUpload) btnSimulateUpload.addEventListener('click', simulatePhotoUpload);
		if (dropzoneMock) dropzoneMock.addEventListener('click', simulatePhotoUpload);

		// Navigation logic
		const showStepSlide = (step) => {
			wizardErrorAlert.classList.add('hidden');
			stepSlides.forEach(slide => {
				const slideStep = parseInt(slide.getAttribute('data-step'));
				if (slideStep === step) {
					slide.classList.remove('hidden');
				} else {
					slide.classList.add('hidden');
				}
			});

			// Update trackers
			stepTrackers.forEach(track => {
				const trackStep = parseInt(track.getAttribute('data-step'));
				const numBox = track.querySelector('.step-num-box');
				const label = track.querySelector('span');

				if (step >= trackStep) {
					numBox.className = 'step-num-box w-6 h-6 rounded-full font-mono text-[10px] flex items-center justify-center transition-all bg-[#C9A227] text-white font-bold';
					if (label) label.className = 'text-xs font-mono text-gray-900 font-bold hidden sm:inline';
				} else {
					numBox.className = 'step-num-box w-6 h-6 rounded-full font-mono text-[10px] flex items-center justify-center transition-all bg-gray-50 text-gray-400 border border-gray-200';
					if (label) label.className = 'text-xs font-mono text-gray-400 hidden sm:inline';
				}
			});

			// Show/hide buttons
			if (step === 1) {
				btnWizardBack.classList.add('hidden');
				wizardSpacer.classList.remove('hidden');
			} else {
				btnWizardBack.classList.remove('hidden');
				wizardSpacer.classList.add('hidden');
			}

			if (step === 4) {
				btnWizardNext.classList.add('hidden');
				btnWizardSubmit.classList.remove('hidden');
			} else {
				btnWizardNext.classList.remove('hidden');
				btnWizardSubmit.classList.add('hidden');
			}
		};

		const validateStep = (step) => {
			if (step === 1) {
				if (HSL.intakeForm.packageType === 'team' && (HSL.intakeForm.teamSize < 1 || isNaN(HSL.intakeForm.teamSize))) {
					showWizardError('Please enter a valid team size count.');
					return false;
				}
			} else if (step === 3) {
				if (HSL.intakeForm.packageType === 'individual' && HSL.intakeForm.simulatedFiles.length === 0) {
					showWizardError('Please upload or simulate at least one raw portrait photo to proceed.');
					return false;
				}
			}
			return true;
		};

		const showWizardError = (msg) => {
			wizardErrorText.textContent = msg;
			wizardErrorAlert.classList.remove('hidden');
			scrollToSection('intake-wizard-section');
		};

		// Bind buttons click
		if (btnWizardNext) {
			btnWizardNext.addEventListener('click', function () {
				if (validateStep(HSL.intakeForm.currentStep)) {
					HSL.intakeForm.currentStep = Math.min(4, HSL.intakeForm.currentStep + 1);
					showStepSlide(HSL.intakeForm.currentStep);
				}
			});
		}

		if (btnWizardBack) {
			btnWizardBack.addEventListener('click', function () {
				HSL.intakeForm.currentStep = Math.max(1, HSL.intakeForm.currentStep - 1);
				showStepSlide(HSL.intakeForm.currentStep);
			});
		}

		// Submit intake form triggers success screen
		if (btnWizardSubmit) {
			btnWizardSubmit.addEventListener('click', function (e) {
				e.preventDefault();
				const name = nameInput.value.trim();
				const email = emailInput.value.trim();
				const notes = notesInput.value.trim();

				if (!name) {
					showWizardError('Please enter your full name.');
					return;
				}
				if (!email || !isValidEmail(email)) {
					showWizardError('Please enter a valid email address.');
					return;
				}

				// Populate compilation state
				HSL.intakeForm.fullName = name;
				HSL.intakeForm.email = email;
				HSL.intakeForm.instructions = notes;

				// Output results on success card
				document.getElementById('success-transact-id').textContent = Math.floor(Math.random() * 90000) + 10000;
				document.getElementById('success-full-name').textContent = HSL.intakeForm.fullName;
				document.getElementById('success-email').textContent = HSL.intakeForm.email;
				
				const packageDetails = HSL.intakeForm.packageType === 'team' 
					? `Team Portal (Size: ${HSL.intakeForm.teamSize})`
					: 'Individual Solo Profile';
				document.getElementById('success-package-details').textContent = packageDetails;
				document.getElementById('success-style-preset').textContent = 'Lighting preset: ' + HSL.intakeForm.photoStyle;

				// Set file upload text
				const filesListContainer = document.getElementById('success-uploaded-files-list');
				if (HSL.intakeForm.packageType === 'team') {
					filesListContainer.innerHTML = '<span>✓ Sync connection enabled dynamically. Onboarding emails ready.</span>';
				} else {
					filesListContainer.innerHTML = '';
					HSL.intakeForm.simulatedFiles.forEach(file => {
						const span = document.createElement('span');
						span.className = 'block';
						span.textContent = '✓ ' + file.split(' ')[0];
						filesListContainer.appendChild(span);
					});
				}

				// Instructions
				const instructionsBox = document.getElementById('success-artist-instructions-box');
				const instructionsText = document.getElementById('success-artist-instructions');
				if (HSL.intakeForm.instructions) {
					instructionsText.textContent = `"${HSL.intakeForm.instructions}"`;
					instructionsBox.classList.remove('hidden');
				} else {
					instructionsBox.classList.add('hidden');
				}

				// Toggle slide visibilities
				wizard.classList.add('hidden');
				successCard.classList.remove('hidden');
				scrollToSection('intake-wizard-section');
			});
		}

		// Reset Intake back to step 1
		if (btnResetIntake) {
			btnResetIntake.addEventListener('click', function () {
				HSL.intakeForm.currentStep = 1;
				HSL.intakeForm.simulatedFiles = [];
				HSL.intakeForm.instructions = '';
				nameInput.value = '';
				emailInput.value = '';
				notesInput.value = '';
				cacheFilesList.classList.add('hidden');
				simulatedListContainer.innerHTML = '';

				successCard.classList.add('hidden');
				wizard.classList.remove('hidden');
				
				syncWizardType();
				showStepSlide(1);
				scrollToSection('intake-wizard-section');
			});
		}

		// Init setup
		syncWizardType();
		showStepSlide(1);
	}

	// ----------------------------------------------------
	// 10. Contact / Consultation booking Forms
	// ----------------------------------------------------
	function initContactForms() {
		const contactForm = document.getElementById('contact-form');
		const contactSuccess = document.getElementById('contact-success-screen');

		const consForm = document.getElementById('cons-form');
		const consSuccess = document.getElementById('cons-success-screen');
		const consModal = document.getElementById('consultation-modal');
		const btnConsModalClose = document.getElementById('btn-cons-modal-close');

		// General Contact dispatch
		if (contactForm) {
			contactForm.addEventListener('submit', function (e) {
				e.preventDefault();
				contactForm.classList.add('hidden');
				contactSuccess.classList.remove('hidden');

				setTimeout(function () {
					contactSuccess.classList.add('hidden');
					contactForm.classList.remove('hidden');
					contactForm.reset();
				}, 4000);
			});
		}

		// Consultation modals toggle triggers
		const openConsultation = () => {
			consModal.classList.remove('hidden');
		};

		const closeConsultation = () => {
			consModal.classList.add('hidden');
			consForm.classList.remove('hidden');
			consSuccess.classList.add('hidden');
			consForm.reset();
		};

		const btnDashboardConsultation = document.getElementById('btn-dashboard-consultation');
		if (btnDashboardConsultation) btnDashboardConsultation.addEventListener('click', openConsultation);

		if (btnConsModalClose) btnConsModalClose.addEventListener('click', closeConsultation);
		consModal.querySelector('.modal-overlay').addEventListener('click', closeConsultation);

		if (consForm) {
			consForm.addEventListener('submit', function (e) {
				e.preventDefault();
				consForm.classList.add('hidden');
				consSuccess.classList.remove('hidden');

				setTimeout(function () {
					closeConsultation();
				}, 2500);
			});
		}
	}

	// ----------------------------------------------------
	// 11. Conversions Tools (Popups, Floating CTA, Chatbot)
	// ----------------------------------------------------
	function initConversionTools() {
		const floatingCta = document.getElementById('floating-discount-badge');
		const exitPopup = document.getElementById('exit-intent-popup');
		const btnExitClose = document.getElementById('btn-exit-popup-close');
		const exitForm = document.getElementById('exit-popup-form');
		const exitError = document.getElementById('exit-popup-error');
		const exitSuccess = document.getElementById('exit-popup-success-container');
		const btnExitContinue = document.getElementById('btn-exit-popup-continue');
		
		const chatTrigger = document.getElementById('btn-chat-trigger');
		const chatPanel = document.getElementById('chat-panel');
		const btnChatClose = document.getElementById('btn-chat-close');
		const chatForm = document.getElementById('chat-send-form');
		const chatInput = document.getElementById('chat-input');
		const chatBox = document.getElementById('chat-messages-box');
		const btnChatEmail = document.getElementById('btn-chat-email');

		// A. Delayed Floating CTA
		setTimeout(function () {
			if (floatingCta) {
				floatingCta.classList.remove('hidden');
				floatingCta.classList.add('animate-bounce');
			}
		}, 4500);

		if (floatingCta) {
			floatingCta.addEventListener('click', function () {
				scrollToSection('intake-wizard-section');
			});
		}

		// B. Exit Intent popup
		let exitPopupTriggered = false;

		const triggerExitPopup = () => {
			if (!exitPopupTriggered) {
				exitPopupTriggered = true;
				exitPopup.classList.remove('hidden');
			}
		};

		// Mouseleave listener
		document.addEventListener('mouseleave', function (e) {
			if (e.clientY < 20) {
				triggerExitPopup();
			}
		});

		// Fallback popup after 25 seconds
		setTimeout(triggerExitPopup, 25000);

		const closeExitPopup = () => {
			exitPopup.classList.add('hidden');
			exitForm.classList.remove('hidden');
			exitSuccess.classList.add('hidden');
			if (exitError) exitError.classList.add('hidden');
			exitForm.reset();
		};

		if (btnExitClose) btnExitClose.addEventListener('click', closeExitPopup);
		exitPopup.querySelector('.popup-overlay').addEventListener('click', closeExitPopup);
		if (btnExitContinue) btnExitContinue.addEventListener('click', closeExitPopup);

		if (exitForm) {
			exitForm.addEventListener('submit', function (e) {
				e.preventDefault();
				const email = document.getElementById('exit-popup-email').value.trim();

				if (!email || !isValidEmail(email)) {
					if (exitError) exitError.classList.remove('hidden');
					return;
				}

				if (exitError) exitError.classList.add('hidden');
				document.getElementById('exit-popup-form-container').classList.add('hidden');
				exitSuccess.classList.remove('hidden');
			});
		}

		// C. Chatbot widget toggles
		if (chatTrigger) {
			chatTrigger.addEventListener('click', function () {
				chatTrigger.classList.add('hidden');
				chatPanel.classList.remove('hidden');
			});
		}

		const closeChatPanel = () => {
			chatPanel.classList.add('hidden');
			chatTrigger.classList.remove('hidden');
		};

		if (btnChatClose) btnChatClose.addEventListener('click', closeChatPanel);

		if (btnChatEmail) {
			btnChatEmail.addEventListener('click', function () {
				closeChatPanel();
				scrollToSection('contact-section');
			});
		}

		// Handle sending chat messages
		if (chatForm) {
			chatForm.addEventListener('submit', function (e) {
				e.preventDefault();
				const text = chatInput.value.trim();
				if (!text) return;

				// Append user message
				appendChatMessage('user', text);
				chatInput.value = '';

				// Simulated replies
				setTimeout(function () {
					appendChatMessage('agent', 'Understood. We help remote teams consistently format and match their backdrops. Would you like me to connect you directly with team support on email or WhatsApp?');
				}, 1200);
			});
		}

		function appendChatMessage(sender, text) {
			const wrap = document.createElement('div');
			wrap.className = sender === 'user' ? 'flex flex-col items-end animate-fadeIn' : 'flex flex-col items-start animate-fadeIn';
			
			const msgBox = document.createElement('div');
			msgBox.className = sender === 'user' 
				? 'p-2.5 rounded-xl max-w-[85%] leading-relaxed bg-[#C9A227] text-white rounded-br-none'
				: 'p-2.5 rounded-xl max-w-[85%] leading-relaxed bg-white text-gray-800 border border-gray-150 rounded-bl-none shadow-xs';
			msgBox.innerHTML = `<p>${text}</p>`;

			wrap.appendChild(msgBox);
			wrap.innerHTML += '<span class="text-[8px] text-gray-400 mt-1 font-mono uppercase">Just now</span>';
			
			chatBox.appendChild(wrap);
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	}

	// ----------------------------------------------------
	// 12. Helper inline SVG elements cache
	// ----------------------------------------------------
	const HSL_SVGS = {
		x: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x w-5 h-5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
		menu: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu w-5 h-5"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
		alertCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle w-3.5 h-3.5 text-gray-400"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12.01" y1="16" y2="16"/><line x1="12" x2="12" y1="8" y2="12"/></svg>',
		checkCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle w-4 h-4 text-[#C9A227]"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
		check: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check w-3 h-3 text-white"><path d="M20 6 9 17l-5-5"/></svg>',
		send: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send w-3 h-3 group-hover:translate-x-0.5 text-gray-400"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
		refreshCcw: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw w-3.5 h-3.5 animate-spin text-amber-600"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
		zap: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap w-3.5 h-3.5"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46L12.6 9h7.4a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46L11.4 15Z"/></svg>',
		award: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-award w-3.5 h-3.5"><circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>',
		flame: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flame w-3.5 h-3.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
	};

})();
