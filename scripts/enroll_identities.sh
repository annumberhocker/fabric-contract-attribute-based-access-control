#! /bin/bash
#
# This script runs through a sample scenario of creating Launches, Payloads 
# It then takes a Payload and Launch through the process
#
echo "What is the IP address for the API server (default is localhost:3000)?"
read API_URL
API_URL=${API_URL:-localhost:3000}
set -x
# base64 encoded string 'userid:userpwd' added for authorization header
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic V2FsbWFydDpXYWxtYXJ0" -H "Content-Type: application/json" -d "{\"userid\":\"Walmart\",\"password\":\"Walmart\",\"usertype\":\"retailer\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic SEVCOkhFQg==" -H "Content-Type: application/json" -d "{\"userid\":\"HEB\",\"password\":\"HEB\",\"usertype\":\"retailer\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic R0hGYXJtOkdIRmFybQ==" -H "Content-Type: application/json" -d "{\"userid\":\"GHFarm\",\"password\":\"GHFarm\",\"usertype\":\"producer\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic QUJGYXJtOkFCRmFybQ==" -H "Content-Type: application/json" -d "{\"userid\":\"ABFarm\",\"password\":\"ABFarm\",\"usertype\":\"producer\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic RkRBOkZEQQ==" -H "Content-Type: application/json" -d "{\"userid\":\"FDA\",\"password\":\"FDA\",\"usertype\":\"regulator\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic RmVkZXg6RmVkZXg=" -H "Content-Type: application/json" -d "{\"userid\":\"Fedex\",\"password\":\"Fedex\",\"usertype\":\"shipper\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic VVBTOlVQUw==" -H "Content-Type: application/json" -d "{\"userid\":\"UPS\",\"password\":\"UPS\",\"usertype\":\"shipper\"}"
curl -X POST "${API_URL}/api/enroll-user" -H "authorization: Basic QUN1c3RvbWVyOkFDdXN0b21lcg==" -H "Content-Type: application/json" -d "{\"userid\":\"ACustomer\",\"password\":\"ACustomer\",\"usertype\":\"customer\"}"