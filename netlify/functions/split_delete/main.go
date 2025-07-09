package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"github.com/kofj/gorm-driver-d1"
	"gorm.io/gorm"
)

type Request struct {
	Id int32 `json:"id"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}
	valid, session := common.Authenticate(request)
	if !valid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
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

	// Open a connection to D1
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "Internal server error: DSN not configured",
		}, nil
	}
	db, err := gorm.Open(d1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[split_delete] failed to connect to db",
		}, nil
	}
	txn := common.Transaction{}
	tx := db.Where("id = ?", req.Id).First(&txn)
	if txn.GroupId != session.Group.Groupid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "error finding txn",
		}, nil
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		err := tx.Model(&common.TransactionUser{}).
			Where("transaction_id = ?", txn.TransactionId).
			Update("deleted", time.Now()).Error
		if err != nil {
			return err
		}
		return tx.Model(&common.Transaction{}).Where("id = ?", req.Id).Update("deleted", time.Now()).Error
	})

	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "error deleting txn",
		}, nil
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "[split_delete] Success",
	}, nil
}

func main() {
	// Make the handler available for Remote Procedure Call
	lambda.Start(handler)
}
