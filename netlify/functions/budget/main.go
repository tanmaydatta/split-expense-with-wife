package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Request struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Pin         string  `json:"pin"`
	Name        string  `json:"name"`
	Groupid     int32   `json:"groupid"`
	Currency    string  `json:"currency"`
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
	fmt.Printf("req: %+v\n", req)
	if session.Group.Groupid != req.Groupid {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}

	if !strings.Contains(session.Group.Budgets, req.Name) {
		return &events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       "unauthorized",
		}, nil
	}

	if !slices.Contains(common.Currencies, req.Currency) {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid currency",
		}, nil
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid pin",
		}, nil
	}

	// Open a connection to PlanetScale
	db, err := gorm.Open(postgres.Open(os.Getenv("DSN_POSTGRES")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget] failed to connect to db",
		}, nil
	}
	sign := "+"
	if req.Amount < 0 {
		sign = "-"
	}
	name := req.Name
	if name == "" {
		name = "house"
	}
	tx := db.Create(&common.BudgetEntry{
		Description: req.Description,
		Price:       fmt.Sprintf("%s%.2f", sign, math.Abs(req.Amount)),
		AddedTime:   time.Now(),
		Amount:      req.Amount,
		Name:        name,
		Groupid:     req.Groupid,
		Currency:    req.Currency,
	})
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error writing in db",
		}, nil
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "[budget] Success",
	}, nil
}

func main() {
	// Make the handler available for Remote Procedure Call
	lambda.Start(handler)
}
