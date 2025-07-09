package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/gorm"
)

type Request struct {
	Offset int32 `json:"offset"`
}

type TransactionsListResponse struct {
	Transactions       []common.Transaction                `json:"transactions"`
	TransactionDetails map[string][]common.TransactionUser `json:"transactionDetails"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}
	// validate price
	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}
	valid, session := common.Authenticate(request)
	if !valid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}

	// ValidateSession()
	// Open a connection to D1
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "Internal server error: DSN not configured",
		}, nil
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[transactions_list] failed to connect to db",
		}, nil
	}
	startFrom := time.Now().Format("2006-01-02 15:04:05")

	entries := []common.Transaction{}
	tx := db.Raw(`
		SELECT id, description, amount, strftime('%Y-%m-%dT%H:%M:%S', created_at) || '.000Z' as created_at, COALESCE(metadata, '{}') as metadata, currency, transaction_id, group_id, strftime('%Y-%m-%dT%H:%M:%S', deleted) || '.000Z' as deleted 
		FROM transactions 
		WHERE datetime(created_at) < datetime(?) AND group_id = ? AND deleted IS NULL 
		ORDER BY datetime(created_at) DESC 
		LIMIT ? OFFSET ?
	`, startFrom, session.Group.Groupid, 5, int(req.Offset)).Scan(&entries)

	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[transactions_list] error reading transactions from db: " + tx.Error.Error(),
		}, nil
	}

	txnIds := []string{}
	for _, entry := range entries {
		txnIds = append(txnIds, entry.TransactionId)
	}

	txnUsers := []common.TransactionUser{}
	tx = db.Raw(`
		SELECT transaction_id, user_id, amount, owed_to_user_id, group_id, currency, strftime('%Y-%m-%dT%H:%M:%S', deleted) || '.000Z' as deleted 
		FROM transaction_users 
		WHERE transaction_id IN ?
	`, txnIds).Scan(&txnUsers)

	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[transactions_list] error reading transaction users from db: " + tx.Error.Error(),
		}, nil
	}

	txnUserMap := map[string][]common.TransactionUser{}
	for _, txnUser := range txnUsers {
		txnUserMap[txnUser.TransactionId] = append(txnUserMap[txnUser.TransactionId], txnUser)
	}

	b, _ := json.Marshal(TransactionsListResponse{
		Transactions:       entries,
		TransactionDetails: txnUserMap,
	})
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       string(b),
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
	}, nil
}

func main() {
	// Make the handler available for Remote Procedure Call
	lambda.Start(handler)
}
