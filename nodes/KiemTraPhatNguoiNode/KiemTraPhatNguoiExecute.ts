import qs from 'qs';
import sharp from 'sharp';
import { parse } from 'node-html-parser';
import {
	cleanCaptcha,
	cleanPlate,
	detectVehicleType,
	getCookieValue,
	isValidCaptcha,
	isValidFinesUrl,
	request,
	retryWrapper,
} from './utils';
import { createWorker } from 'tesseract.js';

const resolverCaptcha = async () => {
	const response = await request({
		url: 'https://kiemtraphatnguoi.vn/lib/captcha/captcha.class.php',
		responseType: 'arraybuffer',
		keepRawResponse: true,
	});

	const sessionId = getCookieValue(response.headers['set-cookie'], 'PHPSESSID');
	let captcha = response.data;

	if (!captcha) return null;

	captcha = Buffer.from(captcha, 'binary');
	// Resize to increase accuracy
	captcha = await sharp(captcha).resize(300, 66).jpeg().toBuffer();

	const worker = await createWorker('eng');

	const ret = await worker.recognize(captcha);
	return { sessionId, captcha: cleanCaptcha(ret.data.text) };
};

const resolverCaptchaRetry = () =>
	retryWrapper({
		fn: resolverCaptcha,
		validateFn: ({ sessionId, captcha }) => !!sessionId && isValidCaptcha(captcha),
	});

const getFinesUrl = async (plate: string, vehicleType: string) => {
	const { sessionId, captcha } = await resolverCaptchaRetry();

	const response = await request({
		url: 'https://www.csgt.vn/?mod=contact&task=tracuu_post&ajax',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			cookie: sessionId,
		},
		data: qs.stringify({
			BienKS: plate,
			Xe: vehicleType,
			captcha,
			ipClient: '9.9.9.91',
			cUrl: '1',
		}),
	});

	return { url: response?.['href'], sessionId };
};

const getFinesUrlRetry = async (plate: string, vehicleType: string) =>
	retryWrapper({
		fn: getFinesUrl,
		validateFn: ({ url, sessionId }) => !!sessionId && isValidFinesUrl(url),
		args: [plate, vehicleType],
	});

const parseFinesUrl = async (finesUrl: string, sessionId: string) => {
	const pageContent = await request({ url: finesUrl, headers: { cookie: sessionId } });
	if (!pageContent) return { retry: true, data: [] };

	const root = parse(pageContent);
	const wrapper = root.querySelector('#bodyPrint123');
	if (!wrapper) return { retry: true, data: [] };

	if (wrapper?.innerText?.trim()?.toLowerCase().includes('Không tìm thấy kết quả'.toLowerCase()))
		return { retry: false, data: [] };

	const separateEl = '<hr style="margin-bottom: 25px;">';

	const wrappers = wrapper.innerHTML?.split(separateEl)?.filter((i) => !!i.trim());

	if (!wrappers) return { retry: true, data: [] };

	const KEYS = [
		'plate',
		'plateColor',
		'vehicleType',
		'violationTime',
		'location',
		'violationType',
		'status',
		'detectingUnit',
	];

	let data = [];

	for (let wrapper of wrappers) {
		let dom = parse(wrapper);
		let allElements = Array.from(dom.querySelectorAll('.form-group'));
		if (!allElements) continue;

		let item: Record<string, any> = {};
		for (let [idx, element] of allElements.entries()) {
			const label = element.querySelector('.col-md-3')?.innerText?.trim();
			const value = element.querySelector('.col-md-9')?.innerText?.trim();

			if (!value && label) continue;

			if (value && KEYS[idx]) {
				item[KEYS[idx]] = value;
			} else {
				item['resolvingUnit'] ||= [];
				item['resolvingUnit'].push(element?.innerText?.trim());
			}
		}

		data.push(item);
	}

	return { retry: data.length === 0 && wrappers.length > 0, data };
};

const parseFinesUrlRetry = (finesUrl: string, sessionId: string) =>
	retryWrapper({
		fn: parseFinesUrl,
		validateFn: ({ retry }) => !retry,
		args: [finesUrl, sessionId],
	});

const checkFines = async (plate: string, vehicleType: string) => {
	plate = cleanPlate(plate);
	if (!vehicleType) vehicleType = detectVehicleType(plate);

	const { url, sessionId } = (await getFinesUrlRetry(plate, vehicleType)) || {};
	if (!url) return { error: true, message: 'Can not get fines url', data: [] };
	if (!sessionId) return { error: true, message: 'Can not get session id', data: [] };

	const finesData = await parseFinesUrlRetry(url, sessionId);
	if (!finesData) return { error: true, message: 'Can not get fines data', data: [] };

	const response = { error: false, message: 'OK', data: finesData.data };
	return response;
};

export { checkFines };
