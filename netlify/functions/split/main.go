package main

import (
	"context"
	"fmt"
	"os"

	"github.com/anvari1313/splitwise.go"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	auth := splitwise.NewAPIKeyAuth(os.Getenv("SPLITWISE_API_KEY"))
	client := splitwise.NewClient(auth)
	userShares := []splitwise.UserShare{
		{
			UserID:    1839952,
			PaidShare: "0.1",
			OwedShare: "0.07",
		},
		{
			UserID:    6814258,
			PaidShare: "0.00",
			OwedShare: "0.03",
		},
	}

	expenses, err := client.CreateExpenseByShare(
		context.Background(),
		splitwise.Expense{
			Cost:         "0.1",
			Description:  "test from code",
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
