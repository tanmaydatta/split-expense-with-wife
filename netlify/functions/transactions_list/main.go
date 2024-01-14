package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	_ "github.com/go-sql-driver/mysql"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/driver/mysql"
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
	// Open a connection to PlanetScale
	db, err := gorm.Open(mysql.Open(os.Getenv("DSN")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget] failed to connect to db",
		}, nil
	}
	startFrom := time.Now()
	entries := []common.Transaction{}
	tx := db.Limit(5).Offset(int(req.Offset)).
		Where("created_at < ? and group_id = ? and deleted is null", startFrom, session.Group.Groupid).
		Order("created_at desc").Find(&entries)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	txnIds := []string{}
	for _, entry := range entries {
		txnIds = append(txnIds, entry.TransactionId)
	}
	txnUsers := []common.TransactionUser{}
	tx = db.Where("transaction_id in ?", txnIds).Find(&txnUsers)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
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
