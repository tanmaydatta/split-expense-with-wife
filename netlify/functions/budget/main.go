package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	_ "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type BudgetEntry struct {
	Id          int32
	Description string
	AddedTime   time.Time
	Price       string
	Amount      float64
	Name        string
}

type Request struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Pin         string  `json:"pin"`
	Name        string  `json:"name"`
}

func (BudgetEntry) TableName() string {
	return "budget"
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

	if req.Pin != os.Getenv("AUTH_PIN") {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "invalid pin",
		}, nil
	}

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
	sign := "+"
	if req.Amount < 0 {
		sign = "-"
	}
	name := req.Name
	if name == "" {
		name = "house"
	}
	tx := db.Create(&BudgetEntry{
		Description: req.Description,
		Price:       fmt.Sprintf("%s%.2f", sign, math.Abs(req.Amount)),
		AddedTime:   time.Now(),
		Amount:      req.Amount,
		Name:        name,
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
