/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   RIYAD INSTAGRAM API — Hashtag Video Search (gallery-dl)      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Same architecture as riyad-pinterest-api: gallery-dl does the actual
 * scraping (Instagram blocks raw axios/node requests at the TLS/HTTP
 * fingerprint level even with valid cookies — gallery-dl's requests
 * library handles this far more reliably).
 *
 * Instagram has no "category" search API. The closest real equivalent
 * is hashtag search (#sad, #funny, etc), which is what this uses —
 * gallery-dl's "instagram:tag" extractor pulls recent posts/reels
 * tagged with a given hashtag.
 *
 * Endpoints:
 *   GET /api/instagram/category?category=<sad|funny|caption|love|lyrics|motivational|attitude>&limit=<n>
 *     -> [ { id, caption, thumbnail, isVideo, videoUrl, postUrl }, ... ]
 *     Tries each hashtag configured for that category (see hashtags.js)
 *     in random order, moving on to the next one whenever a hashtag
 *     turns out to have no video content — much more reliable than
 *     depending on a single hashtag per category.
 *
 *   GET /api/instagram/hashtag?tag=<text>&limit=<n>&offset=<n>
 *     -> same shape, but for one specific hashtag directly (used
 *     internally by /category, also usable standalone)
 *
 *   GET /api/instagram/resolve?url=<any instagram.com/reel|p/... link>
 *     -> same shape as one item above
 *
 * Cookies (recommended, often required to avoid rate limits/blocks):
 *   Set INSTAGRAM_COOKIES env var to the RAW Netscape cookies.txt export
 *   from a logged-in browser session (the "Get cookies.txt LOCALLY"
 *   extension's download — paste the whole file content unmodified).
 *   Written to disk once at startup so gallery-dl can use it via --cookies.
 */
"use strict";

const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const HASHTAGS_BY_CATEGORY = require("./hashtags");

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
//  Cookies — same pattern as riyad-pinterest-api / riyad-video-api.
// ─────────────────────────────────────────────
const COOKIES_PATH = path.join(__dirname, "instagram_cookies.txt");
let hasCookies = false;
if (process.env.INSTAGRAM_COOKIES && process.env.INSTAGRAM_COOKIES.trim()) {
	try {
		fs.writeFileSync(COOKIES_PATH, process.env.INSTAGRAM_COOKIES.trim() + "\n");
		hasCookies = true;
		console.log("✅ Instagram cookies loaded from INSTAGRAM_COOKIES env var.");
	} catch (e) {
		console.error("⚠️ Failed to write cookies file:", e.message);
	}
} else {
	console.warn("⚠️ No INSTAGRAM_COOKIES env var set — gallery-dl will run without login, much more likely to be blocked/rate-limited on Instagram.");
}

// ─────────────────────────────────────────────
//  Run gallery-dl in JSON-dump mode against a URL and return the
//  parsed entries (gallery-dl -j output: array of [type, ...] tuples).
// ─────────────────────────────────────────────
function runGalleryDl(url, extraArgs = []) {
	return new Promise((resolve, reject) => {
		const args = ["-j", "--no-download"];
		if (hasCookies) args.push("--cookies", COOKIES_PATH);
		args.push(...extraArgs, url);

		execFile(
			"gallery-dl",
			args,
			{ timeout: 45000, maxBuffer: 1024 * 1024 * 20 },
			(err, stdout, stderr) => {
				if (err) return reject(new Error(stderr || err.message));
				try {
					const parsed = JSON.parse(stdout);
					resolve(Array.isArray(parsed) ? parsed : []);
				} catch (parseErr) {
					reject(new Error(`Failed to parse gallery-dl output: ${parseErr.message}`));
				}
			}
		);
	});
}

// gallery-dl sometimes emits a "queue" pointer entry (message type 6)
// instead of immediately continuing on to extract the actual post/reel
// in the same pass — same behavior we hit with Pinterest's pin.it
// resolver. When that happens for a single-post resolve, we follow the
// pointer ourselves with a second gallery-dl call.
function isQueueOnlyEntry(entry) {
	return Array.isArray(entry) && entry[0] === 6;
}

async function runGalleryDlFollowingQueue(url, extraArgs = []) {
	let rawEntries = await runGalleryDl(url, extraArgs);

	const hasRealData = rawEntries.some((e) => !isQueueOnlyEntry(e));
	if (!hasRealData && rawEntries.length > 0) {
		const queued = rawEntries.find(isQueueOnlyEntry);
		const nextUrl = queued && typeof queued[1] === "string" ? queued[1] : null;
		if (nextUrl) {
			try {
				const followed = await runGalleryDl(nextUrl, extraArgs);
				if (followed.length > 0) return followed;
			} catch (_) {
				// fall through, return original queue-only entries
			}
		}
	}

	return rawEntries;
}

// Extensions/patterns indicating a video/streamable file rather than a
// static image.
const VIDEO_URL_RE = /\.(mp4|m3u8|mov|m4v)(\?|$)/i;

// Instagram post metadata (via gallery-dl) may nest video renditions
// under one of these keys depending on extractor version. We don't
// hard-code an exact shape — we walk whatever we find looking for a
// direct video URL, same defensive approach as the Pinterest API.
const VIDEO_META_KEYS = ["video_url", "video_versions", "videos"];

function extractVideoUrlFromMeta(meta) {
	// Instagram's most common single field: video_url (direct string).
	if (typeof meta.video_url === "string" && VIDEO_URL_RE.test(meta.video_url)) {
		return meta.video_url;
	}

	const candidates = [];
	const collect = (obj) => {
		if (!obj) return;
		if (typeof obj === "string") {
			if (VIDEO_URL_RE.test(obj)) candidates.push(obj);
			return;
		}
		if (Array.isArray(obj)) {
			obj.forEach(collect);
			return;
		}
		if (typeof obj === "object") {
			if (typeof obj.url === "string" && VIDEO_URL_RE.test(obj.url)) candidates.push(obj.url);
			Object.values(obj).forEach((v) => {
				if (v && typeof v === "object") collect(v);
				else if (typeof v === "string" && VIDEO_URL_RE.test(v)) candidates.push(v);
			});
		}
	};

	for (const key of VIDEO_META_KEYS) {
		if (meta[key]) collect(meta[key]);
	}

	if (candidates.length === 0) return null;
	const mp4 = candidates.find((c) => /\.mp4(\?|$)/i.test(c));
	return mp4 || candidates[0];
}

/**
 * Normalize one gallery-dl JSON entry into { id, caption, thumbnail, isVideo, videoUrl, postUrl }.
 * gallery-dl entries are [type, url_or_metadata, metadata?] — shape varies,
 * so we defensively find whichever element is the actual metadata object.
 */
function normalizeEntry(entry) {
	if (!Array.isArray(entry) || entry.length < 2) return null;

	// Find the metadata object: it's whichever of entry[1]/entry[2] is a
	// plain object (not a string URL).
	let meta = null;
	let directUrl = null;
	for (let i = 1; i < entry.length; i++) {
		const v = entry[i];
		if (v && typeof v === "object" && !Array.isArray(v)) meta = v;
		else if (typeof v === "string") directUrl = v;
	}
	if (!meta) return null;

	let resolvedVideoUrl = extractVideoUrlFromMeta(meta);
	if (!resolvedVideoUrl && directUrl && VIDEO_URL_RE.test(directUrl)) {
		resolvedVideoUrl = directUrl.replace(/^ytdl:/, "");
	}

	const isVideo = Boolean(
		resolvedVideoUrl ||
		meta.is_video === true ||
		meta.media_type === 2 ||
		meta.product_type === "clips" ||
		meta.product_type === "reel"
	);

	const id = String(meta.shortcode || meta.code || meta.id || meta.pk || "");

	const thumbnail =
		meta.display_url ||
		meta.thumbnail_url ||
		meta.thumbnail ||
		(meta.image_versions2 && meta.image_versions2.candidates && meta.image_versions2.candidates[0]?.url) ||
		(!VIDEO_URL_RE.test(directUrl || "") ? directUrl : null) ||
		null;

	if (!isVideo && !thumbnail) return null;

	return {
		id,
		caption: meta.caption || meta.title || meta.description || meta.edge_media_to_caption?.edges?.[0]?.node?.text || "",
		thumbnail,
		isVideo,
		videoUrl: isVideo ? (resolvedVideoUrl || directUrl) : null,
		postUrl: meta.shortcode ? `https://www.instagram.com/p/${meta.shortcode}/` : (id ? `https://www.instagram.com/p/${id}/` : null)
	};
}

function normalizeEntries(rawEntries, limit) {
	const out = [];
	for (const entry of rawEntries) {
		const normalized = normalizeEntry(entry);
		if (normalized && (normalized.thumbnail || normalized.videoUrl)) {
			out.push(normalized);
			if (out.length >= limit) break;
		}
	}

	if (out.length === 0 && rawEntries.length > 0) {
		try {
			console.warn(
				"[instagram] normalizeEntries produced 0 results from",
				rawEntries.length,
				"raw entries. Sample entry:",
				JSON.stringify(rawEntries[0]).slice(0, 2000)
			);
		} catch (_) {}
	}

	return out;
}

// ─────────────────────────────────────────────
//  Shared helper: fetch + normalize video/photo posts for one hashtag.
//  Used by both /hashtag (single tag) and /category (tries several).
// ─────────────────────────────────────────────
async function fetchHashtagPosts(tag, limit, offset) {
	const cleanTag = String(tag).replace(/^#/, "");
	const hashtagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanTag)}/`;
	const rangeEnd = offset + limit - 1;
	const rawEntries = await runGalleryDlFollowingQueue(hashtagUrl, [`--range`, `${offset}-${rangeEnd}`]);
	return normalizeEntries(rawEntries, limit);
}

function shuffle(arr) {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// ─────────────────────────────────────────────
//  GET /api/instagram/hashtag?tag=...&limit=...&offset=...
// ─────────────────────────────────────────────
app.get("/api/instagram/hashtag", async (req, res) => {
	const tag = req.query.tag;
	const limit = Math.min(parseInt(req.query.limit, 10) || 15, 40);
	// Optional: fetch a different window of the hashtag feed instead of
	// always the top N — lets the caller randomize which posts they see
	// across repeated requests instead of getting the same top results
	// (and therefore the same 1-2 videos) every time.
	const offset = Math.max(parseInt(req.query.offset, 10) || 1, 1);

	if (!tag) {
		return res.status(400).json({ error: "tag query param is required" });
	}

	try {
		if (req.query.debug) {
			const cleanTag = String(tag).replace(/^#/, "");
			const hashtagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanTag)}/`;
			const rangeEnd = offset + limit - 1;
			const rawEntries = await runGalleryDlFollowingQueue(hashtagUrl, [`--range`, `${offset}-${rangeEnd}`]);
			return res.json({ rawEntries });
		}

		const posts = await fetchHashtagPosts(tag, limit, offset);

		if (posts.length === 0) {
			return res.status(404).json([]);
		}
		return res.json(posts);
	} catch (err) {
		console.error("[instagram/hashtag] error:", err.message);
		return res.status(500).json({ error: err.message });
	}
});

// ─────────────────────────────────────────────
//  GET /api/instagram/category?category=<key>&limit=...
//  Tries each hashtag configured for that category (hashtags.js) in
//  random order, moving on to the next whenever one turns out to have
//  no video content, and returns as soon as one succeeds. Much more
//  reliable than hard-coding a single hashtag per category.
// ─────────────────────────────────────────────
app.get("/api/instagram/category", async (req, res) => {
	const category = req.query.category;
	const limit = Math.min(parseInt(req.query.limit, 10) || 20, 40);
	const videosOnly = req.query.videosOnly !== "false"; // default true

	if (!category) {
		return res.status(400).json({ error: "category query param is required" });
	}

	const tagList = HASHTAGS_BY_CATEGORY[category];
	if (!tagList || tagList.length === 0) {
		return res.status(400).json({
			error: `Unknown category "${category}". Available: ${Object.keys(HASHTAGS_BY_CATEGORY).join(", ")}`
		});
	}

	const triedTags = [];
	const shuffledTags = shuffle(tagList);

	try {
		for (const tag of shuffledTags) {
			triedTags.push(tag);
			const offset = Math.floor(Math.random() * 60) + 1;

			let posts;
			try {
				posts = await fetchHashtagPosts(tag, limit, offset);
			} catch (err) {
				console.error(`[instagram/category] "${tag}" failed, trying next:`, err.message);
				continue;
			}

			const candidates = videosOnly ? posts.filter((p) => p.isVideo && p.videoUrl) : posts;
			if (candidates.length > 0) {
				return res.json({ tagUsed: tag, triedTags, posts: candidates });
			}
			// this hashtag had no usable content — loop continues to the next one
		}

		// every configured hashtag for this category came up empty
		return res.status(404).json({ error: "No video content found across any configured hashtag for this category.", triedTags });
	} catch (err) {
		console.error("[instagram/category] error:", err.message);
		return res.status(500).json({ error: err.message, triedTags });
	}
});

// ─────────────────────────────────────────────
//  GET /api/instagram/resolve?url=<instagram.com/reel|p/... link>
// ─────────────────────────────────────────────
app.get("/api/instagram/resolve", async (req, res) => {
	const inputUrl = req.query.url;
	if (!inputUrl) {
		return res.status(400).json({ error: "url query param is required" });
	}

	try {
		const rawEntries = await runGalleryDlFollowingQueue(inputUrl);

		if (req.query.debug) {
			return res.json({ rawEntries });
		}

		const posts = normalizeEntries(rawEntries, 1);

		if (posts.length === 0) {
			return res.status(404).json({ error: "Could not resolve any media from that URL" });
		}
		return res.json(posts[0]);
	} catch (err) {
		console.error("[instagram/resolve] error:", err.message);
		return res.status(500).json({ error: err.message });
	}
});

app.get("/", (req, res) => {
	res.json({
		status: "ok",
		engine: "gallery-dl",
		cookiesLoaded: hasCookies,
		endpoints: [
			"/api/instagram/category?category=&limit=",
			"/api/instagram/hashtag?tag=&limit=&offset=",
			"/api/instagram/resolve?url="
		],
		categories: Object.keys(HASHTAGS_BY_CATEGORY)
	});
});

app.listen(PORT, () => {
	console.log(`✅ Riyad Instagram API (gallery-dl) listening on port ${PORT}`);
});
