package main

import (
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/gorm"
)

type Request struct {
}

type TransactionBalances struct {
	UserId       int32   `json:"user_id"`
	Amount       float64 `json:"amount"`
	OwedToUserId int32   `json:"owed_to_user_id"`
	Currency     string  `json:"currency"`
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
			Body:       "[balances] failed to connect to db",
		}, nil
	}
	balances := []TransactionBalances{}
	tx := db.Model(&common.TransactionUser{}).Select("user_id, owed_to_user_id, currency, sum(amount) as amount").Where("group_id = ? and deleted is null", session.Group.Groupid).Group("user_id, owed_to_user_id, currency").Find(&balances)
	if tx.Error != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget] failed to connect to db",
		}, nil
	}

	balancesByUser := map[string]map[string]float64{}
	for _, balance := range balances {
		if balance.UserId == balance.OwedToUserId {
			continue
		}
		if balance.UserId == session.User.Id {
			if _, ok := balancesByUser[session.UsersById[balance.OwedToUserId].FirstName]; !ok {
				balancesByUser[session.UsersById[balance.OwedToUserId].FirstName] = map[string]float64{}
			}
			balancesByUser[session.UsersById[balance.OwedToUserId].FirstName][balance.Currency] -= balance.Amount
		} else if balance.OwedToUserId == session.User.Id {
			if _, ok := balancesByUser[session.UsersById[balance.UserId].FirstName]; !ok {
				balancesByUser[session.UsersById[balance.UserId].FirstName] = map[string]float64{}
			}
			balancesByUser[session.UsersById[balance.UserId].FirstName][balance.Currency] += balance.Amount
		}
	}
	b, _ := json.Marshal(balancesByUser)
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
