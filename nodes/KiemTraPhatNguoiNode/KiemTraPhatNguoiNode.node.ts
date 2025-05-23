import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { checkFines } from './KiemTraPhatNguoiExecute';

export class KiemTraPhatNguoiNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Kiem Tra Phat Nguoi',
		name: 'kiemTraPhatNguoi',
		group: ['transform'],
		version: 1,
		description: 'Kiem Tra Phat Nguoi',
		defaults: {
			name: 'Kiem Tra Phat Nguoi',
			color: '#772244',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Biển số',
				name: 'plate',
				type: 'string',
				default: '',
				placeholder: 'Nhập biển số',
				description: 'Nhập biển số xe cần kiểm tra',
			},
			{
				displayName: 'Loại xe',
				name: 'vehicleType',
				type: 'options',
				options: [
					{
						name: 'Ô tô',
						value: '1',
					},
					{
						name: 'Xe máy',
						value: '2',
					},
					{
						name: 'Xe đạp điện',
						value: '3',
					},
				],
				default: '1',
				description: 'Chọn loại xe cần kiểm tra',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		let item: INodeExecutionData;
		let plate: string;
		let vehicleType: string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				plate = this.getNodeParameter('plate', itemIndex, '') as string;
				vehicleType = this.getNodeParameter('vehicleType', itemIndex, '') as string;
				item = items[itemIndex];

				const response = await checkFines(plate, vehicleType);
				item.json.error = response.error;
				item.json.message = response.message;
				item.json.data = response.data || [];
			} catch (error) {
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return this.prepareOutputData(items);
	}
}
