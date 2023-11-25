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
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type BudgetEntry struct {
	Id          int32
	Description string    `json:"description"`
	AddedTime   time.Time `json:"added_time"`
	Price       string    `json:"price"`
	Amount      float64
	Name        string
}

type Request struct {
	StartTs string `json:"start_ts"`
	Pin     string `json:"pin"`
	Name    string `json:"name"`
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

	// if req.Pin != os.Getenv("AUTH_PIN") {
	// 	return &events.APIGatewayProxyResponse{
	// 		StatusCode: 503,
	// 		Body:       "invalid pin",
	// 	}, nil
	// }

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
	if req.StartTs != "" {
		startFrom, err = time.Parse("2006-01-02 15:04:05", req.StartTs)
		if err != nil {
			return &events.APIGatewayProxyResponse{
				StatusCode: 400,
				Body:       "invalid input",
			}, nil
		}
	}
	name := req.Name
	if name == "" {
		name = "house"
	}
	entries := []BudgetEntry{}
	tx := db.Limit(10).Where("added_time < ? and name = ?", startFrom, name).Find(&entries)
	if tx.Error != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading from db",
		}, nil
	}
	b, _ := json.Marshal(entries)
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
