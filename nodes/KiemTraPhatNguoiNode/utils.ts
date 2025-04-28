import { LoggerProxy as Logger } from 'n8n-workflow';
import axios from 'axios';

const getCookieValue = (cookies: string[] | string, cookieName: string) => {
	const cookiesArray = Array.isArray(cookies) ? cookies : [cookies];

	for (const header of cookiesArray) {
		if (typeof header !== 'string') continue;
		const parts = header.split(';');
		const [cookiePair] = parts;
		if (!cookiePair.startsWith(`${cookieName}=`)) continue;
		return cookiePair;
	}

	return null;
};

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

const retryWrapper = async ({
	fn,
	validateFn,
	onRetryCallback,
	maxRetries = 5,
	delay = 1000,
	debug = false,
	args,
}: {
	fn: (...args: any[]) => Promise<any>;
	validateFn: (response: any) => boolean;
	onRetryCallback?: () => Promise<void>;
	maxRetries?: number;
	delay?: number;
	debug?: boolean;
	args?: any[] | Record<string, any>;
}) => {
	let attempt = 0;
	let shouldContinue = true;
	let response;

	do {
		let fnResponse;
		try {
			if (Array.isArray(args)) {
				fnResponse = await fn(...args);
			} else if (typeof args === 'object' && args !== null) {
				fnResponse = await fn({ ...args });
			} else {
				fnResponse = await fn();
			}
		} catch (err) {
			if (debug) Logger.error(`${fn.name} failed, error: ${err.stack}`);
		}

		if (debug) Logger.info(`${fn.name} response ->`, fnResponse);

		if (validateFn(fnResponse)) {
			shouldContinue = false;
			response = fnResponse;
		} else {
			attempt++;
			await sleep(delay);
			if (onRetryCallback) await onRetryCallback();
			Logger.info(`${fn.name} retry ${attempt}/${maxRetries}`);
			shouldContinue = attempt < maxRetries;
		}
	} while (shouldContinue);

	return response;
};

const request = async ({
	url,
	method = 'GET',
	headers,
	data,
	timeout = 10000,
	responseType = 'json',
	keepRawResponse = false,
	logResponse = false,
}: {
	url: string;
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	headers?: Record<string, string>;
	data?: Record<string, any> | string;
	timeout?: number;
	responseType?: 'json' | 'text' | 'arraybuffer' | 'stream';
	keepRawResponse?: boolean;
	logResponse?: boolean;
}) => {
	try {
		const response = await axios({
			url,
			method,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
				'content-type': 'text/html; charset=UTF-8',
				...headers,
			},
			timeout,
			responseType,
			...(data ? (method === 'GET' ? { params: data } : { data }) : {}),
		});

		const results = keepRawResponse ? response : response.data;

		Logger.info(`request done${logResponse ? `, data: ${JSON.stringify(results)}` : ''}`);

		return results;
	} catch (err) {
		Logger.error(`request error: ${err.stack}`);
		return null;
	}
};

const cleanPlate = (plate = '') => plate.replace(/[^a-z0-9]/gi, '');

const detectVehicleType = (plate = '') => (plate.length === 8 ? '1' : '2');

const isValidCaptcha = (captcha = '') => !!captcha && captcha.length === 6;

const cleanCaptcha = (captcha = '') =>
	captcha
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/gi, '');

const isValidFinesUrl = (finesUrl = '') => !!finesUrl && finesUrl.startsWith('https://www.csgt.vn');

export {
	getCookieValue,
	sleep,
	retryWrapper,
	request,
	isValidCaptcha,
	cleanCaptcha,
	isValidFinesUrl,
	cleanPlate,
	detectVehicleType,
};
