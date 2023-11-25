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
	Description string
	AddedTime   time.Time
	Price       string
	Name        string
}

type Request struct {
	Pin  string `json:"pin"`
	Name string `json:"name"`
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

	var sum float64
	name := req.Name
	if name == "" {
		name = "house"
	}
	err = db.Table("budget").Where("name = ?", name).Select("sum(amount)").Row().Scan(&sum)
	fmt.Println(err)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       "[budget] error reading sum from db",
		}, nil
	}
	sign := "+"
	if sum <= 0 {
		sign = "-"
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       fmt.Sprintf(`{"sum": "%s%.2f"}`, sign, sum),
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
	}, nil
}

func main() {
	// Make the handler available for Remote Procedure Call
	lambda.Start(handler)
}
