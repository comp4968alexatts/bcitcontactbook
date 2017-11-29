# bcitcontactbook
## setup

### AWS lambda
1. Create a empty lambda function, add a "alexa skills kit" trigger to the function (markdown the name of the function). 
2. Modify lambda/deploy, set the --function-name parameter to the function name created in step 1 (!! use chmod to make the scripts excutable before running them !!). 
3. Go into the lambda directory and run deploy to upload the code to the lambda function.
4. Set envirment variables for the lambda, referenct to the lambda function. 

### AWS dynamoDB
cd into the dbsetup directory, and run the scripts accordingly:
1. Create tables:  run ./create_tables.
2. Check tables status: run ./check_tables. make sure all the tables in "Active" status before uploading data. 
3. Upload sample data: run ./upload_data.
4. Delete table: run ./delete_tables. Run this script when you finish all the testing and want to delete all the tables to save some money from AWS :) .

### alexa skill developer portal
1. Create a new skill from the console. 
2. set up the interaction scheam with skill_config/schema.json and add the customized slots type in the file skill_config/customized_type.txt
3. link the skill to the lambda function created in step 1 (use the arn) .



