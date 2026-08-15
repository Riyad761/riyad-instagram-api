/**
 * Hashtags configured per category — the server tries these, in random
 * order, one at a time, until one of them actually has video content
 * (see /api/instagram/category in server.js). Having MANY tags per
 * category (mixing Bangla, English, and Hindi) is what makes this
 * reliable — any single hashtag can be sparse on videos or temporarily
 * rate-limited, but with 15-20 options per category it's very unlikely
 * ALL of them come up empty at once.
 */
module.exports = {
	sad: [
		"sadstatus", "sadvideo", "sadshayari", "sadquotes", "sadsong",
		"broken_heart_status", "heartbrokenstatus", "sadwhatsappstatus",
		"koster_kotha", "koster_status", "koster_line", "mon_kharap",
		"dukkho", "koster_pic", "bewafa_shayari", "dard_shayari",
		"udaas_status", "dukhi_status", "tanhai_shayari"
	],
	funny: [
		"funnyvideo", "funnyreels", "funnymemes", "funnyclips",
		"comedyvideo", "funnymoments", "funnyshorts",
		"hasir_video", "moja_video", "bangla_funny", "bangla_comedy",
		"funny_bangladesh", "comedy_reels", "hasi_khusi",
		"majedar_video", "chutkula", "comedy_shayari"
	],
	caption: [
		"captionforinstagram", "instacaption", "captionideas",
		"attitudecaption", "lovecaption", "bio_caption",
		"caption_bangla", "bangla_caption", "status_caption",
		"fbcaption", "captionquotes", "shortcaption", "deep_caption"
	],
	love: [
		"lovevideo", "lovestatus", "lovequotes", "lovesong",
		"romanticvideo", "couplegoals", "lovewhatsappstatus",
		"bhalobasha", "bhalobashar_golpo", "prem_kahini", "premer_status",
		"pyar_shayari", "mohabbat_status", "ishq_shayari", "romantic_shayari"
	],
	lyrics: [
		"lyricsvideo", "lyricsstatus", "songlyrics", "banglasonglyrics",
		"lyrical_video", "hindisonglyrics", "lyricsedit",
		"gaanerkotha", "banglagaan", "gaan_lyrics", "shorterlyrics",
		"lyricsreels", "lofi_lyrics"
	],
	motivational: [
		"motivationalvideo", "motivationalquotes", "motivationalspeech",
		"successmotivation", "inspirationalvideo", "motivationreels",
		"onuprerona", "success_story_bangla", "motivational_bangla",
		"josh_status", "safalta_shayari", "hindimotivation", "positivevibes"
	],
	attitude: [
		"attitudestatus", "attitudequotes", "attitudevideo", "attitudeboy",
		"attitudegirl", "attitudeshayari", "royal_attitude",
		"attitude_bangla", "attitude_status_bangla", "nawabi_attitude",
		"khiladi_attitude", "boss_attitude", "swag_status"
	]
};
