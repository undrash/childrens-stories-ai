import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchGetCommandInput,
  BatchWriteCommand,
  BatchWriteCommandInput,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { JSONObject, JSONValue } from '../types';
import { promisifyInBatches } from '../utils';

export enum TableOperation {
  GET = 'GET',
  PUT = 'PUT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  BATCH_GET = 'BATCH GET',
  BATCH_PUT = 'BATCH PUT',
  BATCH_UPDATE = 'BATCH UPDATE',
  BATCH_DELETE = 'BATCH DELETE',
}

export type BatchGetOperationParams = {
  RequestItems: { [tableName: string]: { Keys: JSONObject[] } };
};

export type BatchWriteOperationParams = {
  RequestItems: { [tableName: string]: JSONObject[] };
};

export type BatchDeleteOperationParams = {
  RequestItems: {
    [tableName: string]: { DeleteRequest: { Key: JSONObject } }[];
  };
};

type AWSError = Error & { code?: string };

export type DynamoConfig = {
  name: string;
  region: string;
  hashKey: string;
  rangeKey: string | null;
  tableName: string;
};

export enum VisitorOperations {
  GET = 'GET',
  PRE_PUT = 'PRE_PUT',
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
  BATCH_GET = 'BATCH_GET',
  BATCH_PUT = 'BATCH_PUT',
  BATCH_UPDATE = 'BATCH_UPDATE',
  BATCH_DELETE = 'BATCH_DELETE',
}

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_lib_dynamodb.html#configuration
const translateConfig = {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
};
export class DynamoTable<
  Model extends JSONObject = JSONObject,
  ModelKeys extends JSONObject = JSONObject,
> {
  name: string;
  region: string;
  hashKey: string;
  rangeKey: string | null;
  tableName: string;

  protected docClient;

  constructor(config: DynamoConfig) {
    const { name, region, hashKey, rangeKey, tableName } = config;

    if (!name) {
      throw new Error(
        "Name identifier is required when instantiating a 'DBTable'.",
      );
    }

    if (!region) {
      throw new Error(
        `Please specify an AWS region when instantiating the ${name} 'DBTable'.`,
      );
    }

    if (!hashKey) {
      throw new Error(
        `The 'hashKey' property is required when instantiating the ${name} 'DBTable'.`,
      );
    }

    this.name = name;
    this.region = region;
    this.hashKey = hashKey;
    this.rangeKey = rangeKey || null;
    this.tableName = tableName;

    const client = new DynamoDBClient({ region });

    this.docClient = DynamoDBDocumentClient.from(client, translateConfig);
  }

  getRequiredQueryPropsMessage() {
    if (this.rangeKey) {
      return JSON.stringify(
        {
          [this.hashKey]: 'targetvalue',
          [this.rangeKey]: 'targetvalue',
        },
        null,
        2,
      );
    } else {
      return JSON.stringify(
        {
          [this.hashKey]: 'targetvalue',
        },
        null,
        2,
      );
    }
  }

  validateOperationArgs(args: JSONObject, operation: TableOperation) {
    if (!operation) {
      throw new Error(
        "The 'operation' argument is required when validating item params. This helps with traceability.",
      );
    }

    if (!args) {
      throw new Error(
        `Please provide an input object when performing a '${operation}' operation on '${
          this.name
        }'. \nUse the following format: \n${this.getRequiredQueryPropsMessage()}`,
      );
    }

    if (Object.prototype.toString.call(args) !== '[object Object]') {
      const message = `Your input should be an object when performing a '${operation}' operation on '${
        this.name
      }'. \nUse the following format:  \n${this.getRequiredQueryPropsMessage()}`;

      throw new Error(message);
    }

    const hashVal = args[this.hashKey];
    const rangeVal = this.rangeKey ? args[this.rangeKey] : undefined;

    if (hashVal === undefined) {
      const input = JSON.stringify(args, null, 2);

      throw new Error(
        `Item hashKey '${
          this.hashKey
        }' value is required when performing a '${operation}' operation on '${
          this.name
        }'. \nUse the following format: \n${this.getRequiredQueryPropsMessage()} \nYour input provided: \n${input}`,
      );
    }

    if (this.rangeKey && rangeVal === undefined) {
      const input = JSON.stringify(args, null, 2);

      throw new Error(
        `Your table schema requires a range key value for '${
          this.rangeKey
        }' when performing a '${operation}' operation on '${
          this.name
        }'. \nUse the following format: \n${this.getRequiredQueryPropsMessage()} \nYour input provided: \n${input}`,
      );
    }
  }

  validateOperationArgsList(argsList: JSONObject[], operation: TableOperation) {
    if (!operation) {
      throw new Error(
        "The 'operation' argument is required when validating a query param list. This helps with traceability.",
      );
    }

    if (!argsList || !argsList.length) {
      throw new Error(
        `A list of arguments are required when performing a '${operation}' operation on '${
          this.name
        }'. \nPlease refer to the following format: [\n${this.getRequiredQueryPropsMessage()}'\n]`,
      );
    }

    for (const arg of argsList) {
      this.validateOperationArgs(arg, operation);
    }
  }

  async throwAwsError(awsError: AWSError, operation: TableOperation) {
    if (!awsError) {
      throw new Error(
        `Trying to throw AWS error without an argument in '${this.name}' during '${operation}' operation.`,
      );
    }

    switch (awsError.code) {
      case 'ResourceNotFoundException':
        throw new Error(
          `'${operation}' operation failed on '${this.name}'. The table name '${this.tableName}' was Not Found. AWS Error: \n${awsError}`,
        );

      default:
        throw new Error(
          `'${operation}' operation failed on '${this.name}'. AWS Error: \n${awsError}`,
        );
    }
  }

  protected async paginateQuery(params: QueryCommandInput): Promise<Model[]> {
    let res;
    const events: Model[] = [];

    do {
      res = await this.docClient.send(new QueryCommand(params));
      res.Items!.forEach((item) => events.push(item as Model));

      params.ExclusiveStartKey = res.LastEvaluatedKey;
    } while (typeof res.LastEvaluatedKey !== 'undefined');

    return events;
  }

  protected async paginateScan(): Promise<Model[]> {
    const params: ScanCommandInput = {
      TableName: this.tableName,
    };

    const items: Model[] = [];
    let res;

    do {
      res = await this.docClient.send(new ScanCommand(params));
      res.Items!.forEach((item) => items.push(item as Model));

      params.ExclusiveStartKey = res.LastEvaluatedKey;
    } while (typeof res.LastEvaluatedKey !== 'undefined');

    return items;
  }

  async get(queryParams: ModelKeys): Promise<Model | null> {
    this.validateOperationArgs(queryParams, TableOperation.GET);

    const hashVal = queryParams[this.hashKey];

    const rangeVal = this.rangeKey ? queryParams[this.rangeKey] : undefined;

    const params: GetCommandInput = {
      TableName: this.tableName,
      Key: {
        [this.hashKey]: hashVal,
        ...(this.rangeKey && { [this.rangeKey]: rangeVal }),
      },
    };

    let result;
    try {
      result = await this.docClient.send(new GetCommand(params));
    } catch (err) {
      await this.throwAwsError(err as AWSError, TableOperation.GET);
    }

    if (result && result.Item) {
      return result.Item as Model;
    }

    return null;
  }

  async batchGet(queryParamList: ModelKeys[]): Promise<Model[]> {
    this.validateOperationArgsList(queryParamList, TableOperation.BATCH_GET);

    const params: BatchGetCommandInput = {
      RequestItems: {
        [this.tableName]: {
          Keys: [],
        },
      },
    };

    params.RequestItems![this.tableName].Keys = queryParamList.map((qp) => ({
      [this.hashKey]: qp[this.hashKey],
      ...(this.rangeKey && { [this.rangeKey]: qp[this.rangeKey] }),
    }));

    let response;
    try {
      response = await this.docClient.send(new BatchGetCommand(params));
    } catch (err) {
      await this.throwAwsError(err as AWSError, TableOperation.BATCH_GET);
    }

    if (response && response.Responses) {
      const result = response.Responses[this.tableName];

      return result as Model[];
    }

    return [];
  }

  async put(item: Model, returnOldItem = false): Promise<Model | null> {
    this.validateOperationArgs(item, TableOperation.PUT);

    const params = {
      Item: item,
      TableName: this.tableName,
      ReturnValues: 'ALL_OLD', // 'NONE' || 'ALL_OLD'
    };

    let result;
    try {
      result = await this.docClient.send(new PutCommand(params));
    } catch (err) {
      await this.throwAwsError(err as AWSError, TableOperation.PUT);
    }

    const oldItem = result?.Attributes;
    const isCreate = !oldItem;

    if (isCreate) {
      return item as Model;
    }

    const resultData = returnOldItem ? result?.Attributes || null : item;

    return resultData as Model | null;
  }

  async batchPut(items: Model[]): Promise<Model[]> {
    this.validateOperationArgsList(items, TableOperation.BATCH_PUT);

    const BATCH_SIZE = 20;

    const params: BatchWriteOperationParams = {
      RequestItems: {
        [this.tableName]: [],
      },
    };

    for (let i = 0; i < items.length; i++) {
      params.RequestItems[this.tableName].push({
        PutRequest: {
          Item: items[i],
        },
      });

      if (
        params.RequestItems[this.tableName].length >= BATCH_SIZE ||
        (items.length - 1 === i && params.RequestItems[this.tableName].length)
      ) {
        try {
          await this.docClient.send(new BatchWriteCommand(params));
        } catch (err) {
          await this.throwAwsError(err as AWSError, TableOperation.BATCH_PUT);
        }

        params.RequestItems[this.tableName] = [];
      }
    }

    return items as Model[];
  }

  async update(
    item: Partial<Model> & ModelKeys,
    returnOldItem = false,
  ): Promise<Model | null> {
    this.validateOperationArgs(item, TableOperation.UPDATE);

    const keys = Object.keys(item).filter(
      (key) => key !== this.hashKey && key !== this.rangeKey,
    );

    const updateExpressions = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, JSONValue> = {};

    for (const key of keys) {
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = item[key];
    }

    const hashVal = item[this.hashKey];
    const rangeVal = this.rangeKey ? item[this.rangeKey] : undefined;

    const params: UpdateCommandInput = {
      TableName: this.tableName,
      Key: {
        [this.hashKey]: hashVal,
        ...(this.rangeKey && { [this.rangeKey]: rangeVal }),
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: returnOldItem ? 'ALL_OLD' : 'ALL_NEW',
    };

    let result;
    try {
      result = await this.docClient.send(new UpdateCommand(params));
    } catch (err) {
      await this.throwAwsError(err as AWSError, TableOperation.UPDATE);
    }

    return (result?.Attributes as Model) || null;
  }

  async batchUpdate(
    items: Array<Partial<Model> & ModelKeys>,
  ): Promise<Model[]> {
    this.validateOperationArgsList(items, TableOperation.BATCH_UPDATE);

    const updateRequests = items.map(
      (item) =>
        async (
          resolve: (param: unknown) => void,
          reject: (param: unknown) => void,
        ) => {
          try {
            const updated = await this.update(item);

            resolve(updated);
          } catch (err) {
            reject(err);
          }
        },
    );

    const result = await promisifyInBatches(updateRequests);

    return result as Model[];
  }

  async delete(queryParams: ModelKeys): Promise<Model | null> {
    this.validateOperationArgs(queryParams, TableOperation.DELETE);

    const hashVal = queryParams[this.hashKey];
    const rangeVal = this.rangeKey ? queryParams[this.rangeKey] : undefined;

    const params = {
      TableName: this.tableName,
      Key: {
        [this.hashKey]: hashVal,
        ...(this.rangeKey && { [this.rangeKey]: rangeVal }),
      },
      ReturnValues: 'ALL_OLD',
    };

    let result;

    try {
      result = await this.docClient.send(new DeleteCommand(params));
    } catch (err) {
      await this.throwAwsError(err as AWSError, TableOperation.DELETE);
    }

    return (result?.Attributes as Model) || null;
  }

  async batchDelete(queryParamList: ModelKeys[]): Promise<Model[]> {
    this.validateOperationArgsList(queryParamList, TableOperation.BATCH_DELETE);

    const unprocessedItems = [];
    const BATCH_SIZE = 20;

    const params: BatchWriteCommandInput = {
      RequestItems: {
        [this.tableName]: [],
      },
    };

    for (let i = 0; i < queryParamList.length; i++) {
      params.RequestItems![this.tableName].push({
        DeleteRequest: {
          Key: {
            [this.hashKey]: queryParamList[i][this.hashKey],
            ...(this.rangeKey && {
              [this.rangeKey]: queryParamList[i][this.rangeKey],
            }),
          },
        },
      });

      if (
        params.RequestItems![this.tableName].length >= BATCH_SIZE ||
        (queryParamList.length - 1 === i &&
          params.RequestItems![this.tableName].length)
      ) {
        let result;

        try {
          result = await this.docClient.send(new BatchWriteCommand(params));
        } catch (err) {
          await this.throwAwsError(
            err as AWSError,
            TableOperation.BATCH_DELETE,
          );
        }

        if (
          result &&
          result.UnprocessedItems &&
          result.UnprocessedItems[this.tableName]
        ) {
          unprocessedItems.push(result.UnprocessedItems[this.tableName]);
        }

        params.RequestItems![this.tableName] = [];
      }
    }

    return unprocessedItems as unknown as Model[];
  }
}
