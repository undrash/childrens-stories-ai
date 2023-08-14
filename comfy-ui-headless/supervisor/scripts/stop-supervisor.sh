#!/usr/bin/env bash
set -Eeo pipefail

#http://supervisord.org/events.html#event-listeners-and-event-notifications

printf "READY\n";

while read -r; do
  echo -e "\e[31m Service was stopped or one of it's services crashed,
            see the logs above for more details. \e[0m" >&2
  kill -SIGTERM $PPID
done < /dev/stdin
