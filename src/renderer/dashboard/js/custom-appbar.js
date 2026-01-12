// Wire buttons to preload API
const min = document.getElementById('dashMinimize')
const close = document.getElementById('dashClose')
if (min) min.addEventListener('click', () => window.api.minimize())
if (close) close.addEventListener('click', () => window.api.close())

// Inject the side-brand into the sidebar so it can be managed by this module
document.addEventListener('DOMContentLoaded', () => {
	try {
		const appbar = document.querySelector('.app-bar')
		if (!appbar) return
		const existing = document.getElementById('appBarBrand')
		const brandHtml = `
			<div id="appBarBrand" class="d-flex align-items-center gap-2 me-auto ps-2">
				<div class="logo-square rounded d-flex align-items-center justify-content-center" style="width:28px;height:28px;background-color:var(--brand-yellow);">
					<i class="bi bi-mortarboard text-white" style="font-size:14px; line-height:1;"></i>
				</div>
				<div class="d-none d-sm-flex flex-column justify-content-center">
					<div class="h6 mb-0" style="font-size:1rem; line-height:1;">Nvians School Management System</div>
				</div>
			</div>`

		if (!existing) {
			const wrapper = document.createElement('div')
			wrapper.innerHTML = brandHtml
			// Insert as first child so buttons stay on the right
			appbar.insertBefore(wrapper.firstElementChild, appbar.firstChild)
		} else {
			existing.innerHTML = ''
			existing.insertAdjacentHTML('beforeend', brandHtml)
		}
	} catch (e) {
		console.warn('custom-appbar: failed to inject side brand', e)
	}
})
