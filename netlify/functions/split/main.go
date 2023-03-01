package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/anvari1313/splitwise.go"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

type Request struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	var req = Request{}
	if json.Unmarshal([]byte(request.Body), &req) != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       "Error parsing input",
		}, nil
	}
	auth := splitwise.NewAPIKeyAuth(os.Getenv("SPLITWISE_API_KEY"))
	client := splitwise.NewClient(auth)
	userShares := []splitwise.UserShare{
		{
			UserID:    1839952,
			PaidShare: fmt.Sprintf("%.2f", req.Amount),
			OwedShare: fmt.Sprintf("%.2f", req.Amount*0.7),
		},
		{
			UserID:    6814258,
			PaidShare: "0.00",
			OwedShare: fmt.Sprintf("%.2f", req.Amount*0.3),
		},
	}

	expenses, err := client.CreateExpenseByShare(
		context.Background(),
		splitwise.Expense{
			Cost:         fmt.Sprintf("%.2f", req.Amount),
			Description:  req.Description,
			CurrencyCode: "GBP",
			GroupId:      0,
		},
		userShares,
	)

	fmt.Printf("%+v\n", expenses)
	if err != nil {
		return &events.APIGatewayProxyResponse{
			StatusCode: 503,
			Body:       err.Error(),
		}, nil
	}
	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "Success",
	}, nil
}

func main() {
	lambda.Start(handler)
}
