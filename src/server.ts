import dotenv from "dotenv";
dotenv.config();

import http from "http";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { LounasDataProvider, LounasResponse } from "model/LounasDataProvider.js";

import RuokapaikkaFiDataProvider from "./model/RuokapaikkaFiDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "./model/Settings.js";

console.info("Lounasbotti server starting...");

if (!process.env["SLACK_SECRET"] || !process.env["SLACK_TOKEN"]) {
	throw new Error("Missing required parameter(s)");
}

const { App } = bolt;

process.on("unhandledRejection", error => {
	// FIXME: Should we just throw?
	console.error(error);
});

// TODO: Read settings from JSON file
const settings: Settings = {
	dataProvider: "ruokapaikkaFi",
	userAgent: "Mozilla/5.0 (compatible; Lounasbotti/1.0;)",
	defaultRestaurants: [Restaurant.savo, Restaurant.talli, Restaurant.rami, Restaurant.august],
	gitUrl: "https://github.com/ojaha065/lounasbotti"
};

let dataProvider: LounasDataProvider;

switch (settings.dataProvider) {
	case "ruokapaikkaFi":
		dataProvider = new RuokapaikkaFiDataProvider(settings);
		break;
	default:
		throw new Error(`Unknown data provider ${settings.dataProvider}`);
}

const app = new App({
	signingSecret: process.env["SLACK_SECRET"],
	token: process.env["SLACK_TOKEN"],
	socketMode: process.env["SLACK_SOCKET"] as unknown as boolean || false,
	appToken: process.env["SLACK_APP_TOKEN"] || ""
});

app.message(/!(lounas|ruokaa)/, async ({say}) => {
	const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants);
	say({
		text: "Lounasbotin hakemat lounaslistat", // Fallback for notifications
		blocks: [{
			type: "header",
			text: {
				type: "plain_text",
				text: `Lounaslistat${data.length && data[0].date ? ` (${data[0].date})` : ""}`
			}
		}, ...data.map(lounasResponse => {
			return {
				type: "section",
				text: {
					type: "mrkdwn",
					text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse .items || [lounasResponse .error]).map(item => `  * ${item}`).join("\n"))}`
				}
			};
		}), {
			type: "divider"
		}, {
			type: "section",
			text: {
				type: "mrkdwn",
				verbatim: true, // No automatic link parsing
				text: `_Hei, olen Lounasbotti ja olen vielä beta-asteella... Auta minua kehittymään paremmaksi --> ${settings.gitUrl}_`
			}
		}]
	});
});

const botPort = 3000;
const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
app.start(botPort).then(() => {
	console.log(`Lounasbotti server started on port ${botPort}`);

	// Keep Heroku free Dyno running
	if (process.env["HEROKU_INSTANCE_URL"]) {
		http.createServer((_req, res) => {
			res.writeHead(204).end();
		}).listen(webPort, () => {
			setInterval(() => {
				fetch(process.env["HEROKU_INSTANCE_URL"] || "", {
					method: "GET"
				});
			}, 1000 * 60 * 10);
		});
	}
});