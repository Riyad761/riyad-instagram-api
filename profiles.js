/**
 * Profiles configured per category. The server tries these, in random
 * order, one profile at a time, until one of them actually has video
 * content — same rotation idea as hashtags.js, but pointed at specific
 * curated Instagram accounts instead of hashtag search (hashtags get
 * blocked/rate-limited far more easily than a plain profile page).
 *
 * Having multiple profiles per category means the SAME profile isn't
 * used every single time — a different one gets picked per request
 * (see the shuffle() call in server.js), while still only pulling from
 * profiles that match the category the user asked for.
 *
 * Categories with no profiles listed here fall back to the old
 * hashtag-based lookup in hashtags.js (see server.js) — add more
 * profiles here whenever you have them, no code changes needed.
 */
module.exports = {
	caption: [
		"yeah11412",
		"mir_editz_09",
		"hey_sorwar01",
		"nyx_tamim",
		"faysal_ahmed_xyz",
		"_the_end_224_",
		"_.sami.ahmed",
		"meher_x04"
	],
	lyrics: [
		"lyrics4ux____",
		"drizzle_lofi",
		"ifeelmoonedit",
		"__musical_vibes_mv",
		"_lyrical.manishhh",
		"gb_lyrics",
		"abrarrrvisuals",
		"itslive__1",
		"love_lyrice07",
		"ayeshu_clicks",
		"lyrical.editz_15x"
	],
	"90s": [
		"feels_loop",
		"90sbollymusic_",
		"film_ybeatz",
		"90shitzone",
		"purani_music",
		"_lostintheworldofmusic"
	],
	love: [
		"themelody.hub",
		"edits_obsession",
		"_lyrics.mania_",
		"uscinema.in",
		"jalsha_movies__",
		"framesby_vijay"
	],
	funny: [
		"_jawra_billa_",
		"funny_._.reels",
		"funny.ass.reels",
		"funny_reels0199"
	]
};
