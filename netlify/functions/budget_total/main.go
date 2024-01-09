package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"slices"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	_ "github.com/go-sql-driver/mysql"
	"github.com/tanmaydatta/split-expense-with-wife/netlify/common"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type Request struct {
	Pin  string `json:"pin"`
	Name string `json:"name"`
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

	var req = Request{}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       fmt.Sprintf("Error parsing input, %v", err.Error()),
		}, nil
	}
	if err := validateBudgetTotalRequest(&req, session); err != nil {
		log.Default().Println(err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       err.Error(),
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

	name := req.Name
	if name == "" {
		name = "house"
	}
	type Budgets struct {
		Currency string  `json:"currency"`
		Amount   float64 `json:"amount"`
	}
	budgets := []Budgets{}
	tx := db.Model(&common.BudgetEntry{}).Select("currency, sum(amount) as amount").Where("name = ? and groupid = ? and deleted is null", name, session.Group.Groupid).Group("currency").Find(&budgets)
	if tx.Error != nil {
		log.Fatalf("failed to connect: %v", err)
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "[budget] failed to connect to db, " + tx.Error.Error(),
		}, nil
	}
	b, _ := json.Marshal(budgets)
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

func validateBudgetTotalRequest(req *Request, session *common.CurrentSession) error {
	budgets := []string{}
	err := json.Unmarshal([]byte(session.Group.Budgets), &budgets)
	if err != nil {
		return fmt.Errorf("error parsing budgets")
	}
	if !slices.Contains(budgets, req.Name) {
		return fmt.Errorf("invalid budget name")
	}
	return nil
}
