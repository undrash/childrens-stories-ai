#!/usr/bin/env bash

set -euo pipefail

# enable debug
# set -x

echo "Bootstrapping Localstack"
echo "==================="
LOCALSTACK_HOST=localhost
AWS_REGION=eu-north-1
DEFAULT_RESOURCE_NAME="inference"

create_queue() {
    local QUEUE_NAME_TO_CREATE=$1
    awslocal --endpoint-url=http://${LOCALSTACK_HOST}:4566 sqs create-queue --queue-name ${QUEUE_NAME_TO_CREATE} --region ${AWS_REGION} --attributes VisibilityTimeout=30
}

create_bucket() {
    local BUCKET_NAME_TO_CREATE=$1
    awslocal --endpoint-url=http://${LOCALSTACK_HOST}:4566 s3 mb s3://${BUCKET_NAME_TO_CREATE} --region ${AWS_REGION}
}

create_sns_topic() {
    local TOPIC_NAME_TO_CREATE=$1
    awslocal --endpoint-url=http://${LOCALSTACK_HOST}:4566 sns create-topic --name ${TOPIC_NAME_TO_CREATE}.fifo --region ${AWS_REGION} --attributes ContentBasedDeduplication=true,FifoTopic=true
}

create_queue $DEFAULT_RESOURCE_NAME
create_bucket $DEFAULT_RESOURCE_NAME
create_sns_topic $DEFAULT_RESOURCE_NAME