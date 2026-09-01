/* Field Notes - progressive enhancement for the static docs.
   Everything here is optional: the pages read fine with JavaScript disabled. */

;(function () {
  'use strict'

  var base = window.__BASE__ || '/'
  var body = document.body

  // ------------------------------------------------------------- theme

  var themeBtn = document.querySelector('[data-toggle-theme]')
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      var current = document.documentElement.dataset.theme || (prefersDark ? 'dark' : 'light')
      var next = current === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('theme', next)
      } catch (e) {
        /* private browsing - the choice just will not persist */
      }
    })
  }

  // --------------------------------------------------------- navigation

  var menuBtn = document.querySelector('.menu-btn')
  var scrim = document.querySelector('.scrim')
  var sidebar = document.getElementById('sidebar')

  function setNav(open) {
    body.classList.toggle('nav-open', open)
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (scrim) scrim.hidden = !open
  }

  if (menuBtn) menuBtn.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')) })
  if (scrim) scrim.addEventListener('click', function () { setNav(false) })

  // Collapsible nav groups.
  Array.prototype.forEach.call(document.querySelectorAll('.nav-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      var group = btn.closest('.nav-group')
      var open = group.classList.toggle('is-open')
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
  })

  // Keep the current page visible in a long sidebar.
  var current = document.querySelector('.nav-link.is-current')
  if (current && sidebar && sidebar.scrollHeight > sidebar.clientHeight) {
    var offset = current.offsetTop - sidebar.clientHeight / 2
    if (offset > 0) sidebar.scrollTop = offset
  }

  // ------------------------------------------------------- copy buttons

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.parentNode.querySelector('code')
      if (!code || !navigator.clipboard) return
      navigator.clipboard.writeText(code.textContent).then(function () {
        var original = btn.textContent
        btn.textContent = 'Copied'
        setTimeout(function () { btn.textContent = original }, 1400)
      })
    })
  })

  // ------------------------------------------------------------ search

  var overlay = document.querySelector('.search-overlay')
  var input = document.querySelector('.search-input')
  var results = document.querySelector('.search-results')
  var index = null
  var activeIndex = -1
  var lastFocus = null

  function loadIndex() {
    if (index) return Promise.resolve(index)
    return fetch(base + 'search-index.json')
      .then(function (r) { return r.json() })
      .then(function (data) { index = data; return index })
      .catch(function () { index = []; return index })
  }

  function openSearch() {
    if (!overlay) return
    lastFocus = document.activeElement
    overlay.hidden = false
    body.classList.add('search-open')
    setNav(false)
    loadIndex().then(function () { if (input.value) run(input.value) })
    input.focus()
    input.select()
  }

  function closeSearch() {
    if (!overlay) return
    overlay.hidden = true
    body.classList.remove('search-open')
    if (lastFocus && lastFocus.focus) lastFocus.focus()
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-open-search]'), function (btn) {
    btn.addEventListener('click', openSearch)
  })
  Array.prototype.forEach.call(document.querySelectorAll('[data-close-search]'), function (btn) {
    btn.addEventListener('click', closeSearch)
  })
  if (overlay) {
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeSearch() })
  }

  document.addEventListener('keydown', function (event) {
    var typing = /^(input|textarea|select)$/i.test(event.target.tagName)
    if (event.key === 'Escape') {
      if (overlay && !overlay.hidden) closeSearch()
      else if (body.classList.contains('nav-open')) setNav(false)
      return
    }
    if (!typing && (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key === 'k'))) {
      event.preventDefault()
      openSearch()
    }
  })

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    })
  }

  function highlight(text, terms) {
    var safe = escapeHtml(text)
    terms.forEach(function (term) {
      if (term.length < 2) return
      var pattern = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig')
      safe = safe.replace(pattern, '<mark>$1</mark>')
    })
    return safe
  }

  /** Rank a page against the query. Title matches beat heading matches beat body matches. */
  function score(entry, terms) {
    var title = entry.t.toLowerCase()
    var section = (entry.s || '').toLowerCase()
    var headings = (entry.h || []).join(' ').toLowerCase()
    var bodyText = (entry.b || '').toLowerCase()
    var total = 0

    for (var i = 0; i < terms.length; i += 1) {
      var term = terms[i]
      var hit = 0
      if (title.indexOf(term) === 0) hit += 60
      else if (title.indexOf(term) > -1) hit += 40
      if (section.indexOf(term) > -1) hit += 10
      if (headings.indexOf(term) > -1) hit += 18
      if (bodyText.indexOf(term) > -1) hit += 8
      if (!hit) return 0
      total += hit
    }
    return total
  }

  function snippetFor(entry, terms) {
    var text = entry.b || entry.d || ''
    var lower = text.toLowerCase()
    var at = -1
    for (var i = 0; i < terms.length && at < 0; i += 1) at = lower.indexOf(terms[i])
    if (at < 0) return text.slice(0, 150)
    var from = Math.max(0, at - 50)
    return (from > 0 ? '...' : '') + text.slice(from, from + 160)
  }

  function run(query) {
    var terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) {
      results.innerHTML = '<p class="search-empty">Type to search across every note.</p>'
      return
    }

    var hits = (index || [])
      .map(function (entry) { return { entry: entry, score: score(entry, terms) } })
      .filter(function (row) { return row.score > 0 })
      .sort(function (a, b) { return b.score - a.score })
      .slice(0, 25)

    if (!hits.length) {
      results.innerHTML = '<p class="search-empty">No matches for "' + escapeHtml(query) + '".</p>'
      return
    }

    activeIndex = 0
    results.innerHTML = hits
      .map(function (row, n) {
        var entry = row.entry
        return (
          '<a class="search-hit' + (n === 0 ? ' is-active' : '') + '" href="' + base + entry.u + '" role="option">' +
          (entry.s ? '<span class="search-hit-crumb">' + escapeHtml(entry.s) + '</span>' : '') +
          '<span class="search-hit-title">' + highlight(entry.t, terms) + '</span>' +
          '<span class="search-hit-snippet">' + highlight(snippetFor(entry, terms), terms) + '</span>' +
          '</a>'
        )
      })
      .join('')
  }

  if (input) {
    var timer = null
    input.addEventListener('input', function () {
      clearTimeout(timer)
      timer = setTimeout(function () { run(input.value) }, 90)
    })

    input.addEventListener('keydown', function (event) {
      var hits = results.querySelectorAll('.search-hit')
      if (!hits.length) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        hits[activeIndex] && hits[activeIndex].classList.remove('is-active')
        activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length
        hits[activeIndex].classList.add('is-active')
        hits[activeIndex].scrollIntoView({ block: 'nearest' })
      } else if (event.key === 'Enter' && hits[activeIndex]) {
        event.preventDefault()
        window.location.href = hits[activeIndex].getAttribute('href')
      }
    })
  }

  // --------------------------------------------------- table of contents

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'))
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var targets = tocLinks
      .map(function (link) { return document.getElementById(link.getAttribute('href').slice(1)) })
      .filter(Boolean)

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return
          tocLinks.forEach(function (link) {
            link.style.color = link.getAttribute('href') === '#' + entry.target.id ? 'var(--accent-text)' : ''
          })
        })
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    targets.forEach(function (target) { observer.observe(target) })
  }

  // Close the TOC by default on small screens so it does not push content down.
  var toc = document.querySelector('.toc details')
  if (toc && window.matchMedia('(max-width: 47.99rem)').matches) toc.open = false

  // ------------------------------------------------- relative build stamp

  // A recent build reads better as "2 hours ago" than as a date. This has to
  // happen in the browser: the pages are static, so a phrase baked at build
  // time would still say "2 hours ago" a month later. The absolute date is
  // what is in the HTML, so with no JavaScript the stamp is merely less
  // friendly, never wrong.
  var WEEK = 7 * 24 * 60 * 60 * 1000

  function relative(ms) {
    if (!window.Intl || !Intl.RelativeTimeFormat) return null
    var rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    var mins = Math.round(ms / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return rtf.format(-mins, 'minute')
    var hours = Math.round(mins / 60)
    if (hours < 24) return rtf.format(-hours, 'hour')
    return rtf.format(-Math.round(hours / 24), 'day')
  }

  // What the top bar shows on a phone. Not localised, because it has to fit
  // beside the site name at 320px and a translated phrase would not.
  function brief(ms) {
    var mins = Math.round(ms / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return mins + 'm'
    var hours = Math.round(mins / 60)
    if (hours < 24) return hours + 'h'
    return Math.round(hours / 24) + 'd'
  }

  Array.prototype.forEach.call(document.querySelectorAll('.build-stamp'), function (stamp) {
    var el = stamp.querySelector('time[datetime]')
    if (!el) return
    var built = new Date(el.getAttribute('datetime'))
    if (isNaN(built)) return

    // A clock behind the build host would otherwise read as a future date.
    var age = Math.max(0, Date.now() - built.getTime())
    if (age >= WEEK) return

    var phrase = relative(age)
    if (!phrase) return

    var compact = stamp.querySelector('.stamp-brief')
    if (compact) compact.textContent = brief(age)

    var clock = stamp.querySelector('.stamp-time')
    var absolute = (el.textContent.trim() + ' ' + (clock ? clock.textContent.trim() : '')).trim()
    el.textContent = phrase
    // "2 hours ago 03:05" reads as noise, so the clock goes; it survives in
    // the title and the accessible name.
    if (clock) clock.hidden = true
    if (stamp.hasAttribute('aria-label')) {
      stamp.setAttribute('aria-label', 'Last updated ' + phrase + ', ' + absolute + '. Opens the commit on GitHub.')
    }
  })
})()
